import os
import json
import pytest
from pathlib import Path
from backend.services.delivery_provider import LocalDeliveryProvider, sanitize_filename


def test_sanitize_filename():
    assert sanitize_filename("Cannabis Documentary") == "Cannabis_Documentary"
    assert sanitize_filename("Batch #1 (Special)!") == "Batch_1_Special"
    assert sanitize_filename("Part: 01") == "Part_01"


def test_local_storage_hierarchy_creation(tmp_path):
    provider = LocalDeliveryProvider(base_output_dir=str(tmp_path))

    wav_bytes = b"RIFF....WAVEfmt ...."
    mp3_bytes = b"ID3....."
    metadata = {
        "project": "Cannabis Documentary",
        "batch": 1,
        "paragraph": 2,
        "voice": "Algenib",
        "transcript": "Test speech"
    }

    result = provider.deliver_audio_artifact(
        project_name="Cannabis Documentary",
        batch_number=1,
        paragraph_number=2,
        part_identifier=None,
        wav_bytes=wav_bytes,
        mp3_path_or_bytes=mp3_bytes,
        metadata=metadata
    )

    expected_dir = tmp_path / "Cannabis_Documentary" / "Batch_01" / "Paragraph_02"
    assert expected_dir.exists()
    assert (expected_dir / "narration.wav").exists()
    assert (expected_dir / "narration.mp3").exists()
    assert (expected_dir / "metadata.json").exists()

    with open(expected_dir / "metadata.json", "r") as f:
        meta = json.load(f)
        assert meta["wav"] == "narration.wav"
        assert meta["mp3"] == "narration.mp3"
        assert meta["paragraph"] == 2


def test_project_syncer_and_storage_deletion(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from backend.database import Base
    from backend.models import Project, Batch, Paragraph, Generation
    from backend.services.project_syncer import ProjectSyncer

    # Set up in-memory test database
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()

    # Create dummy project folder in tmp_path / "outputs"
    out_dir = tmp_path / "outputs"
    proj_dir = out_dir / "Test_Sync_Project"
    batch_dir = proj_dir / "Batch_01"
    para_dir = batch_dir / "Paragraph_01_Intro"
    para_dir.mkdir(parents=True)

    # Write metadata and dummy audio
    meta = {
        "transcript": "Synchronized transcript",
        "part": "Intro",
        "voice": "Algenib",
        "duration_seconds": 15.2,
        "style": "Serious"
    }
    with open(para_dir / "metadata.json", "w") as f:
        json.dump(meta, f)
    with open(para_dir / "narration.wav", "wb") as f:
        f.write(b"RIFFWAVE...")

    # Run syncer
    res = ProjectSyncer.sync_outputs(db, base_output_dir=str(out_dir))
    assert res["synced_projects"] == 1

    # Verify Project, Batch, Paragraph, and Generation in DB
    p = db.query(Project).filter(Project.name == "Test_Sync_Project").first()
    assert p is not None
    assert len(p.batches) == 1

    b = p.batches[0]
    assert b.batch_number == 1
    assert len(b.paragraphs) == 1

    para = b.paragraphs[0]
    assert para.paragraph_number == 1
    assert para.status == "COMPLETED"
    assert para.transcript == "Synchronized transcript"
    assert para.voice == "Algenib"

    gen = db.query(Generation).filter(Generation.paragraph_id == para.id).first()
    assert gen is not None
    assert gen.status == "COMPLETED"
    assert gen.duration == 15.2

    # Test Project Storage Deletion
    assert proj_dir.exists()
    deleted = ProjectSyncer.delete_project_storage("Test_Sync_Project", base_output_dir=str(out_dir))
    assert deleted is True
    assert not proj_dir.exists()

