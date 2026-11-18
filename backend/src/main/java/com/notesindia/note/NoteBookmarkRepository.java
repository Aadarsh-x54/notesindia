package com.notesindia.note;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface NoteBookmarkRepository extends JpaRepository<NoteBookmark, UUID> {

    Optional<NoteBookmark> findByUserIdAndNoteId(UUID userId, UUID noteId);

    boolean existsByUserIdAndNoteId(UUID userId, UUID noteId);

    @Query("""
            SELECT b.note.id FROM NoteBookmark b
            WHERE b.user.id = :userId AND b.note.id IN :noteIds
            """)
    Set<UUID> findBookmarkedNoteIds(@Param("userId") UUID userId, @Param("noteIds") Collection<UUID> noteIds);

    @Query("""
            SELECT b.note FROM NoteBookmark b
            WHERE b.user.id = :userId AND b.note.status = 'PUBLISHED'
            ORDER BY b.createdAt DESC
            """)
    Page<Note> findBookmarkedNotes(@Param("userId") UUID userId, Pageable pageable);
}
