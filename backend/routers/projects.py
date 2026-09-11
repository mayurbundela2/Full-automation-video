from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db
from backend.models import Project, Batch, Paragraph, Generation
from backend.schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from backend.services.project_syncer import ProjectSyncer

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.post("/sync-outputs")
def sync_outputs(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Scans and synchronizes outputs folder with the SQLite database."""
    return ProjectSyncer.sync_outputs(db, force=True)


@router.get("", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    # Automatically discover any newly added project folders in outputs/ (debounced for instant dashboard load)
    try:
        ProjectSyncer.sync_outputs(db, force=False)
    except Exception as e:
        # Non-blocking fallback if directory scan encounters transient permission issue
        pass

    projects = db.query(Project).filter(~Project.name.like("E2E%")).order_by(Project.updated_at.desc()).all()
    results = []
    for p in projects:
        batch_ids = [b.id for b in p.batches]
        paragraph_count = db.query(Paragraph).filter(Paragraph.batch_id.in_(batch_ids)).count() if batch_ids else 0
        completed_gen_count = db.query(Generation).filter(
            Generation.paragraph_id.in_(
                db.query(Paragraph.id).filter(Paragraph.batch_id.in_(batch_ids))
            ),
            Generation.status == "COMPLETED"
        ).count() if batch_ids else 0

        results.append(ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            batch_count=len(p.batches),
            paragraph_count=paragraph_count,
            completed_generations=completed_gen_count
        ))
    return results



@router.post("", response_model=ProjectResponse)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    existing = db.query(Project).filter(Project.name == data.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"A project named '{data.name}' already exists.")

    project = Project(
        name=data.name.strip(),
        description=data.description.strip() if data.description else None
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Auto-initialize Batch 01 for instant workspace readiness
    batch = Batch(
        project_id=project.id,
        batch_number=1,
        name="Batch 01",
        status="DRAFT"
    )
    db.add(batch)
    db.commit()
    db.refresh(project)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        batch_count=1,
        paragraph_count=0,
        completed_generations=0
    )


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    batch_ids = [b.id for b in project.batches]
    paragraph_count = db.query(Paragraph).filter(Paragraph.batch_id.in_(batch_ids)).count() if batch_ids else 0
    completed_gen_count = db.query(Generation).filter(
        Generation.paragraph_id.in_(
            db.query(Paragraph.id).filter(Paragraph.batch_id.in_(batch_ids))
        ),
        Generation.status == "COMPLETED"
    ).count() if batch_ids else 0

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        batch_count=len(project.batches),
        paragraph_count=paragraph_count,
        completed_generations=completed_gen_count
    )


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if data.name:
        existing = db.query(Project).filter(Project.name == data.name.strip(), Project.id != project_id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Another project named '{data.name}' already exists.")
        project.name = data.name.strip()

    if data.description is not None:
        project.description = data.description.strip()

    db.commit()
    db.refresh(project)
    return get_project(project_id, db)


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_name = project.name
    # Remove project folder from outputs/ on disk
    try:
        ProjectSyncer.delete_project_storage(project_name)
    except Exception as e:
        pass

    db.delete(project)
    db.commit()
    return {"status": "deleted", "id": project_id, "name": project_name}
