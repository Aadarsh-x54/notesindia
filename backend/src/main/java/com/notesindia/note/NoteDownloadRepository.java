package com.notesindia.note;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface NoteDownloadRepository extends JpaRepository<NoteDownload, UUID> {
}
