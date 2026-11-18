package com.notesindia.note;

import com.notesindia.ai.AiServiceClient;
import com.notesindia.category.Category;
import com.notesindia.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

@Service
public class NoteIndexingService {

    private static final Logger log = LoggerFactory.getLogger(NoteIndexingService.class);

    private final NoteRepository noteRepository;
    private final StorageService storageService;
    private final AiServiceClient aiServiceClient;
    private final NoteIndexingService self;

    public NoteIndexingService(
            NoteRepository noteRepository,
            StorageService storageService,
            AiServiceClient aiServiceClient,
            @Lazy NoteIndexingService self
    ) {
        this.noteRepository = noteRepository;
        this.storageService = storageService;
        this.aiServiceClient = aiServiceClient;
        this.self = self;
    }

    /**
     * Schedules async indexing strictly after the current DB transaction commits,
     * preventing race conditions where the async thread cannot yet see a newly uploaded note.
     */
    public void scheduleIndexAfterCommit(UUID noteId) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    self.indexNoteAsync(noteId);
                }
            });
        } else {
            self.indexNoteAsync(noteId);
        }
    }

    public void scheduleRemoveAfterCommit(UUID noteId) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    self.removeIndexAsync(noteId);
                }
            });
        } else {
            self.removeIndexAsync(noteId);
        }
    }

    @Async
    @Transactional
    public void indexNoteAsync(UUID noteId) {
        indexNoteSync(noteId);
    }

    @Transactional
    public boolean indexNoteSync(UUID noteId) {
        Note note = noteRepository.findById(noteId).orElse(null);
        if (note == null || note.getStatus() != NoteStatus.PUBLISHED) {
            return false;
        }
        try {
            byte[] bytes = storageService.retrieveBytes(note.getStorageKey());
            List<String> categoryNames = note.getCategories().stream().map(Category::getName).toList();
            boolean indexed = aiServiceClient.ingestNote(note, bytes, categoryNames);
            note.setAiIndexed(indexed);
            noteRepository.save(note);
            return indexed;
        } catch (Exception ex) {
            log.warn("Could not index note {} in Padhaku AI: {}", noteId, ex.getMessage());
            return false;
        }
    }

    @Async
    public void removeIndexAsync(UUID noteId) {
        aiServiceClient.deleteNoteIndex(noteId);
    }
}
