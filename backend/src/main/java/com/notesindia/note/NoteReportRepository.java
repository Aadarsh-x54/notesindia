package com.notesindia.note;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface NoteReportRepository extends JpaRepository<NoteReport, UUID> {
    Page<NoteReport> findByStatusOrderByCreatedAtDesc(ReportStatus status, Pageable pageable);
    Page<NoteReport> findAllByOrderByCreatedAtDesc(Pageable pageable);
    long countByStatus(ReportStatus status);
}
