package com.notesindia;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableCaching
@EnableAsync
public class NotesIndiaApplication {

    public static void main(String[] args) {
        SpringApplication.run(NotesIndiaApplication.class, args);
    }
}
