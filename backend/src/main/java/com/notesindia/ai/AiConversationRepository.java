package com.notesindia.ai;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AiConversationRepository extends JpaRepository<AiConversation, UUID> {
    @EntityGraph(attributePaths = "focusedNote")
    List<AiConversation> findByUserIdOrderByUpdatedAtDesc(UUID userId);

    @EntityGraph(attributePaths = "focusedNote")
    Optional<AiConversation> findByIdAndUserId(UUID id, UUID userId);
}
