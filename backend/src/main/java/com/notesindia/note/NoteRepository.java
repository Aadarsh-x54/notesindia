package com.notesindia.note;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NoteRepository extends JpaRepository<Note, UUID> {

    /**
     * Homepage main feed: ALL published notes in strict reverse chronological order.
     * No category filter, no popularity sort, no ranking algorithm.
     */
    @EntityGraph(attributePaths = {"categories", "uploadedBy"})
    Page<Note> findByStatusOrderByCreatedAtDesc(NoteStatus status, Pageable pageable);

    @EntityGraph(attributePaths = {"categories", "uploadedBy"})
    Page<Note> findByUploadedByIdAndStatusNotOrderByCreatedAtDesc(UUID userId, NoteStatus excludedStatus, Pageable pageable);

    @EntityGraph(attributePaths = {"categories", "uploadedBy"})
    Page<Note> findByUploadedByUsernameIgnoreCaseAndStatusOrderByCreatedAtDesc(String username, NoteStatus status, Pageable pageable);

    Optional<Note> findFirstByFileChecksumAndStatus(String fileChecksum, NoteStatus status);

    @EntityGraph(attributePaths = {"categories", "uploadedBy"})
    @Query("""
            SELECT DISTINCT n FROM Note n
            LEFT JOIN n.categories c
            WHERE n.status = :status
              AND (
                    LOWER(n.title) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(n.description) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(COALESCE(n.subject, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(COALESCE(n.institution, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(COALESCE(n.authorName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(c.name) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(c.slug) LIKE LOWER(CONCAT('%', :q, '%'))
              )
            ORDER BY n.createdAt DESC
            """)
    Page<Note> globalSearch(@Param("q") String q, @Param("status") NoteStatus status, Pageable pageable);

    @EntityGraph(attributePaths = {"categories", "uploadedBy"})
    @Query("""
            SELECT DISTINCT n FROM Note n
            JOIN n.categories c
            WHERE n.status = :status
              AND c.id IN :categoryIds
            ORDER BY n.createdAt DESC
            """)
    Page<Note> findByCategoryIds(
            @Param("categoryIds") Collection<UUID> categoryIds,
            @Param("status") NoteStatus status,
            Pageable pageable
    );

    @Query("""
            SELECT DISTINCT n FROM Note n
            JOIN n.categories c
            WHERE n.status = 'PUBLISHED'
              AND n.id <> :noteId
              AND c.id IN :categoryIds
            ORDER BY n.createdAt DESC
            """)
    List<Note> findRelatedNotes(
            @Param("noteId") UUID noteId,
            @Param("categoryIds") Collection<UUID> categoryIds,
            Pageable pageable
    );

    @Query("""
            SELECT DISTINCT n FROM Note n
            JOIN n.categories c
            WHERE c.id = :categoryId
            """)
    List<Note> findAllByCategoryId(@Param("categoryId") UUID categoryId);

    @Query("SELECT COALESCE(SUM(n.fileSizeBytes), 0) FROM Note n WHERE n.status <> 'REMOVED'")
    long sumActiveStorageBytes();

    @Query("SELECT COALESCE(SUM(n.downloadCount), 0) FROM Note n")
    long sumTotalDownloads();

    long countByStatus(NoteStatus status);

    @Query("SELECT n.id FROM Note n WHERE n.status = :status")
    List<UUID> findIdsByStatus(@Param("status") NoteStatus status);

    @Query("""
            SELECT n FROM Note n
            WHERE LOWER(n.title) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(n.description) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(n.uploadedBy.username) LIKE LOWER(CONCAT('%', :q, '%'))
            ORDER BY n.createdAt DESC
            """)
    Page<Note> adminSearch(@Param("q") String q, Pageable pageable);

    Page<Note> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
