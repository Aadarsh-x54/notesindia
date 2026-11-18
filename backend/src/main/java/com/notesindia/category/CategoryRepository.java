package com.notesindia.category;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    Optional<Category> findByNormalizedName(String normalizedName);

    Optional<Category> findBySlug(String slug);

    List<Category> findByParentIsNullOrderByNameAsc();

    List<Category> findByParentIdOrderByNameAsc(UUID parentId);

    @Query("""
            SELECT c FROM Category c
            WHERE LOWER(c.name) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(c.slug) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(COALESCE(c.description, '')) LIKE LOWER(CONCAT('%', :q, '%'))
            ORDER BY c.name ASC
            """)
    List<Category> searchCategories(@Param("q") String q);

    @Query(value = """
            SELECT c.id, COUNT(DISTINCT n.id) AS note_count
            FROM categories c
            LEFT JOIN note_categories nc ON nc.category_id = c.id
            LEFT JOIN notes n ON n.id = nc.note_id AND n.status = 'PUBLISHED'
            GROUP BY c.id
            """, nativeQuery = true)
    List<Object[]> countPublishedNotesByCategory();

    @Query(value = """
            SELECT COUNT(DISTINCT n.id)
            FROM note_categories nc
            JOIN notes n ON n.id = nc.note_id AND n.status = 'PUBLISHED'
            WHERE nc.category_id = :categoryId
            """, nativeQuery = true)
    long countPublishedNotesForCategory(@Param("categoryId") UUID categoryId);
}
