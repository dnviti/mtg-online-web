# Development Status (Central)

## Active Plans
- [Enhance 3D Game View](./devlog/2025-12-14-235500_enhance_3d_game_view.md): Active. Transforming the battlefield into a fully immersive 3D environment.
- [Deck Tester Feature](./devlog/2025-12-15-002500_deck_tester_feature.md): Completed. Implemented a dedicated view to parse custom decks and instantly launch the 3D game sandbox.
- [Game Context Menu & Immersion](./devlog/2025-12-14-235000_game_context_menu.md): Completed. Implemented custom right-click menus and game-feel enhancements.

## Recent Completions
- [Game Battlefield & Manual Mode](./devlog/2025-12-14-234500_game_battlefield_plan.md): Completed.
- [Helm Chart Config](./devlog/2025-12-14-214500_helm_config.md): Completed.
- [CSV Import Robustness](./devlog/2025-12-16-152253_csv_import_robustness.md): Completed. Enhanced CSV parser to dynamically map columns from headers, supporting custom user imports.
- [Fix Socket Mixed Content](./devlog/2025-12-16-183000_fix_socket_mixed_content.md): Completed. Resolved mixed content error in production by making socket connection URL environment-aware.
- [Draft Rules & Pick Logic](./devlog/2025-12-16-180000_draft_rules_implementation.md): Completed. Enforced 4-player minimum and "Pick 2" rule for 4-player drafts.
- [Fix Pack Duplication](./devlog/2025-12-16-184500_fix_pack_duplication.md): Completed. Enforced deep cloning and unique IDs for all draft packs to prevent opening identical packs.
- [Reconnection & Auto-Pick](./devlog/2025-12-16-191500_reconnection_and_autopick.md): Completed. Implemented session persistence, seamless reconnection, and 30s auto-pick on disconnect.
- [Draft Interface UI Polish](./devlog/2025-12-16-195000_draft_ui_polish.md): Completed. Redesigned the draft view for a cleaner, immersive, game-like experience with no unnecessary scrolls.
- [Resizable Draft Interface](./devlog/2025-12-16-200500_resizable_draft_ui.md): Completed. Implemented user-resizable pool panel and card sizes with persistence.
- [Draft UI Zoom Zone](./devlog/2025-12-16-203000_zoom_zone.md): Completed. Implemented dedicated zoom zone for card preview.
- [Host Disconnect Pause](./devlog/2025-12-16-213500_host_disconnect_pause.md): Completed. Specific logic to pause game when host leaves.
- [2025-12-16-215000_anti_tampering.md](./devlog/2025-12-16-215000_anti_tampering.md): Implemented server-side validation for game actions.
- [2025-12-16-220000_session_persistence.md](./devlog/2025-12-16-220000_session_persistence.md): Plan for session persistence and safer room exit logic.
- [2025-12-16-221000_lobby_improvements.md](./devlog/2025-12-16-221000_lobby_improvements.md): Plan for kick functionality and exit button relocation.
- [Fix Draft UI Layout](./devlog/2025-12-16-215500_fix_draft_ui_layout.md): Completed. Fixed "Waiting for next pack" layout to be consistently full-screen.
- [Draft Timer Enforcement](./devlog/2025-12-16-222500_draft_timer.md): Completed. Implemented server-side 60s timer per pick, AFK auto-pick, and global draft timer loop.
- [Pack Generation Update](./devlog/2025-12-16-224000_pack_generation_update.md): Completed. Implemented new 15-slot Play Booster algorithm with lands, tokens, and wildcards.
- [Card Metadata Enhancement](./devlog/2025-12-16-224500_card_metadata_enhancement.md): Completed. Extended Scryfall fetching and `DraftCard` interfaces to include full metadata (CMC, Oracle Text, etc.).
- [Rich Metadata Expansion](./devlog/2025-12-16-223000_enhance_metadata.md): Completed. Further expanded metadata to include legalities, finishes, artist, frame effects, and produced mana.
- [Persist Metadata](./devlog/2025-12-16-230000_persist_metadata.md): Completed. Implemented IndexedDB persistence for Scryfall metadata to ensure offline availability and reduce API calls.
- [Bulk Parse Feedback](./devlog/2025-12-16-231500_bulk_parse_feedback.md): Completed. Updated `CubeManager` to handle metadata generation properly and provide feedback on missing cards.
- [Full Metadata Passthrough](./devlog/2025-12-16-234500_full_metadata_passthrough.md): Completed. `DraftCard` now includes a `definition` property containing the complete, raw Scryfall object for future-proofing and advanced algorithm usage.
- [Server-Side Caching](./devlog/2025-12-16-235900_server_side_caching.md): Completed. Implemented logic to cache images and metadata on the server upon bulk parsing, and updated client to use local assets.
- [Peasant Algorithm Implementation](./devlog/2025-12-16-225700_peasant_algorithm.md): Completed. Implemented Peasant-specific pack generation rules including slot logic for commons, uncommons, lands, and wildcards.
- [Multi-Expansion Selection](./devlog/2025-12-16-230500_multi_expansion_selection.md): Completed. Implemented searchable multi-select interface for "From Expansion" pack generation, allowing mixed-set drafts.
- [Game Type Filter](./devlog/2025-12-16-231000_game_type_filter.md): Completed. Added Paper/Digital filter to the expansion selection list.
- [Incremental Caching](./devlog/2025-12-16-233000_incremental_caching.md): Completed. Refactored data fetching to cache cards to the server incrementally per set, preventing PayloadTooLarge errors.
- [Server Graceful Shutdown Fix](./devlog/2025-12-17-002000_server_shutdown_fix.md): Completed. Implemented signal handling to ensure clean process exit on Ctrl+C.
- [Cube Sticky Sidebar](./devlog/2025-12-17-003000_cube_sticky_sidebar.md): Completed. Made the Cube Manager left sidebar sticky to improve usability with long pack lists.
- [Cube Full Width Layout](./devlog/2025-12-17-003500_cube_full_width.md): Completed. Updated Cube Manager to use the full screen width.
- [Cube Archidekt View](./devlog/2025-12-17-004500_archidekt_view.md): Completed. Implemented column-based stacked view for packs.
- [Cube Mobile UI Fixes](./devlog/2025-12-17-005000_mobile_ui_fixes.md): Completed. Fixed overlapping elements and disabled hover previews on mobile.
- [Mobile Long-Press Preview](./devlog/2025-12-17-005500_mobile_long_press.md): Completed. Implemented long-press trigger for card magnification on small screens.
- [Mobile Fullscreen Preview](./devlog/2025-12-17-010000_mobile_fullscreen_preview.md): Completed. Updated mobile preview to be a centered fullscreen overlay.
- [Mobile Preview Animations](./devlog/2025-12-17-010500_mobile_preview_animations.md): Completed. Implemented phase-in layout and phase-out animations for mobile preview.
