package com.notesindia.note;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface NoteViewRepository extends JpaRepository<NoteView, UUID> {

    @Query("""
            SELECT v FROM NoteView v
            JOIN FETCH v.note n
            WHERE v.user.id = :userId AND n.status = 'PUBLISHED'
            ORDER BY v.viewedAt DESC
            """)
    List<NoteView> findRecentViewsByUser(@Param("userId") UUID userId, Pageable pageable);
}
