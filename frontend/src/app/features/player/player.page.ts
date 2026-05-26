import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, catchError, takeUntil, take } from 'rxjs/operators';
import { fromEvent, of, Subject, timer } from 'rxjs';
import type { RuntimeSnapshot } from '@interactive-video/shared';
import { PlayerApiService } from './player.api';
import { PlayerStore } from './player.store';
import { PreloadManagerService } from './preload-manager';

@Component({
  selector: 'app-player-page',
  standalone: true,
  templateUrl: './player.page.html',
  styleUrl: './player.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlayerStore, PreloadManagerService],
})
export class PlayerPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(PlayerApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly store = inject(PlayerStore);
  private readonly preload = inject(PreloadManagerService);

  readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('videoRef');
  readonly videoSecondaryRef = viewChild<ElementRef<HTMLVideoElement>>('videoSecondary');

  /** Emits to teardown previous video subscriptions on scene change */
  private readonly videoTeardown$ = new Subject<void>();

  private autoTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private videoInitTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionSaved = false;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly snapshot = signal<RuntimeSnapshot | null>(null);
  readonly copied = signal(false);

  readonly currentScene = this.store.currentScene;
  readonly variables = this.store.variables;
  readonly history = this.store.history;
  readonly availableChoices = this.store.availableChoices;
  readonly isEnding = this.store.isEnding;
  readonly finished = this.store.finished;

  /** Whether the current scene has video (and it loaded successfully) */
  readonly hasVideo = computed(() => !!this.currentScene()?.video && !this.videoError());

  /** Whether the primary video element is the first one (for crossfade CSS) */
  readonly primaryIsFirst = signal(true);

  /** Whether video has reached endSec and choices should be shown */
  readonly videoEnded = signal(false);

  /** Whether video failed to load (fallback to text mode) */
  readonly videoError = signal(false);

  /** Whether video is currently playing */
  readonly videoPlaying = signal(false);

  /** Whether autoplay was blocked and user must click to start */
  readonly autoplayBlocked = signal(false);

  /** Current video time for progress display */
  readonly videoCurrentTime = signal(0);

  /** Show choices: always for text mode; only after video ends for video mode */
  readonly showChoices = computed(() => {
    if (this.finished()) return false;
    if (!this.hasVideo()) return true;
    return this.videoEnded();
  });

  readonly variableEntries = computed(() => {
    const vars = this.variables();
    return Object.entries(vars).filter(([k]) => !k.startsWith('__'));
  });

  readonly choiceColsClass = computed(() => {
    const count = this.availableChoices().length;
    return 'cols-' + Math.min(count, 3);
  });

  /** Formatted video timecode: "MM:SS / MM:SS" */
  readonly videoTimeDisplay = computed(() => {
    const scene = this.currentScene();
    if (!scene?.video) return '';
    const cur = this.videoCurrentTime() - scene.video.startSec;
    const total = scene.video.endSec - scene.video.startSec;
    return this.formatSec(Math.max(0, cur)) + ' / ' + this.formatSec(total);
  });

  /** Seconds until choice window */
  readonly secsUntilChoice = computed(() => {
    const scene = this.currentScene();
    if (!scene?.video) return 0;
    return Math.max(0, scene.video.endSec - this.videoCurrentTime());
  });

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Escape → go back
    if (event.key === 'Escape') {
      event.preventDefault();
      this.goBack();
      return;
    }

    // Digit 1-9 → select choice
    if (!this.showChoices() || this.finished()) return;
    const digit = parseInt(event.key, 10);
    if (digit >= 1 && digit <= 9) {
      const choices = this.availableChoices();
      const idx = digit - 1;
      if (idx < choices.length) {
        event.preventDefault();
        this.onChoice(choices[idx].target, choices[idx].label);
      }
    }
  }

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const publicId = params.get('publicId');
          if (!publicId) {
            this.error.set('Не указан идентификатор сценария');
            this.loading.set(false);
            return of(null);
          }
          this.loading.set(true);
          this.error.set(null);
          return this.api.getSnapshot(publicId).pipe(
            catchError(() => {
              this.error.set('Сценарий не найден или ещё не опубликован');
              this.loading.set(false);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((snapshot) => {
        if (snapshot) {
          this.snapshot.set(snapshot);
          this.store.init(snapshot);
          this.preload.init(snapshot);
          this.loading.set(false);
        }
      });

    // When scene changes, set up video or handle auto-transition
    effect(() => {
      const scene = this.currentScene();
      if (!scene) return;

      // Clear pending timers from previous scene
      if (this.videoInitTimer) { clearTimeout(this.videoInitTimer); this.videoInitTimer = null; }
      if (this.autoTransitionTimer) { clearTimeout(this.autoTransitionTimer); this.autoTransitionTimer = null; }

      this.videoEnded.set(false);
      this.videoPlaying.set(false);
      this.videoError.set(false);
      this.autoplayBlocked.set(false);
      this.videoCurrentTime.set(scene.video?.startSec ?? 0);

      if (scene.video) {
        this.videoInitTimer = setTimeout(() => this.initVideoPlayback(), 0);
      } else if (scene.autoTransition) {
        this.autoTransitionTimer = setTimeout(() => this.store.followAutoTransition(), 800);
      }
    });

    // When session finishes (ending reached), save session to backend
    effect(() => {
      if (!this.finished() || this.sessionSaved) return;
      this.sessionSaved = true;

      const publicId = this.route.snapshot.paramMap.get('publicId');
      if (!publicId) return;

      this.api
        .saveSession(publicId, {
          finalState: this.variables() as Record<string, unknown>,
          visitedScenes: this.history().map((h) => ({
            sceneId: h.sceneId,
            chosenLabel: h.chosenLabel,
            ts: h.timestamp,
          })),
          completedAt: new Date().toISOString(),
        })
        .pipe(
          take(1),
          catchError(() => of(null)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe();
    });
  }

  /** Register video elements with preload manager once both are in DOM */
  private ensurePreloadElements(): void {
    const primary = this.videoRef()?.nativeElement;
    const secondary = this.videoSecondaryRef()?.nativeElement;
    if (primary && secondary) {
      this.preload.setElements(
        this.primaryIsFirst() ? primary : secondary,
        this.primaryIsFirst() ? secondary : primary,
      );
    }
  }

  private initVideoPlayback(): void {
    const scene = this.currentScene();
    if (!scene?.video) return;

    // Teardown any previous video subscriptions
    this.videoTeardown$.next();

    this.ensurePreloadElements();

    const endSec = scene.video.endSec;
    const startSec = scene.video.startSec;

    // Try to use preloaded video (swap elements)
    const swapped = this.preload.trySwap(scene.id);
    let video: HTMLVideoElement;

    if (swapped) {
      // Preloaded element becomes primary — crossfade via CSS class
      video = swapped;
      this.primaryIsFirst.update((v) => !v);
    } else {
      // Fallback: load into current primary
      const elRef = this.videoRef();
      const secRef = this.videoSecondaryRef();
      video = this.primaryIsFirst()
        ? elRef?.nativeElement!
        : secRef?.nativeElement!;
      if (!video) return;
      video.src = scene.video.url;
      video.currentTime = startSec;
    }

    const until$ = this.videoTeardown$;

    // Listen to timeupdate to stop at endSec
    fromEvent(video, 'timeupdate')
      .pipe(takeUntil(until$), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.videoCurrentTime.set(video.currentTime);
        if (video.currentTime >= endSec) {
          video.pause();
          this.videoPlaying.set(false);
          this.videoEnded.set(true);
          // Auto-transition after video ends if scene has no choices
          const s = this.currentScene();
          if (s?.autoTransition && this.availableChoices().length === 0) {
            this.autoTransitionTimer = setTimeout(() => this.store.followAutoTransition(), 500);
          }
        }
      });

    // Video ended naturally (duration < endSec)
    fromEvent(video, 'ended')
      .pipe(take(1), takeUntil(until$), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.videoPlaying.set(false);
        this.videoEnded.set(true);
        const s = this.currentScene();
        if (s?.autoTransition && this.availableChoices().length === 0) {
          this.autoTransitionTimer = setTimeout(() => this.store.followAutoTransition(), 500);
        }
      });

    // Track play/pause state
    fromEvent(video, 'play')
      .pipe(takeUntil(until$), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.videoPlaying.set(true));

    fromEvent(video, 'pause')
      .pipe(takeUntil(until$), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.videoPlaying.set(false));

    // Handle video load error — fallback to text mode
    fromEvent(video, 'error')
      .pipe(take(1), takeUntil(until$), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.videoError.set(true);
        this.videoPlaying.set(false);
        // If text scene with autoTransition, trigger it
        const s = this.currentScene();
        if (s?.autoTransition && this.availableChoices().length === 0) {
          this.autoTransitionTimer = setTimeout(() => this.store.followAutoTransition(), 800);
        }
      });

    if (swapped) {
      // Already loaded — seek to start and play
      video.currentTime = startSec;
      this.tryPlayVideo(video);
    } else {
      // Seek to start after metadata loaded, then auto-play
      fromEvent(video, 'loadedmetadata')
        .pipe(take(1), takeUntil(until$), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          video.currentTime = startSec;
          this.tryPlayVideo(video);
        });
      video.load();
    }

    // Start preloading next scene(s) after a short delay
    setTimeout(() => {
      if (scene) {
        this.ensurePreloadElements();
        this.preload.preloadNextScenes(scene, this.store.variables());
      }
    }, 300);
  }

  /** Try to play video, handling autoplay policy rejection */
  private tryPlayVideo(video: HTMLVideoElement): void {
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay blocked by browser — show "click to play" overlay
        this.autoplayBlocked.set(true);
      });
    }
  }

  /** User clicked the "play" overlay — now play() is in a user gesture context */
  onPlayClick(): void {
    this.autoplayBlocked.set(false);
    const elRef = this.videoRef();
    const secRef = this.videoSecondaryRef();
    const video = this.primaryIsFirst()
      ? elRef?.nativeElement
      : secRef?.nativeElement;
    if (video) {
      video.play();
    }
  }

  onChoice(target: string, label: string): void {
    this.store.makeChoice(target, label);
  }

  onRestart(): void {
    this.sessionSaved = false;
    this.preload.reset();
    this.primaryIsFirst.set(true);
    this.store.restart();
  }

  onShare(): void {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    this.copied.set(true);
    timer(2000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.copied.set(false));
  }

  goBack(): void {
    this.router.navigate(['/projects']);
  }

  /**
   * Transform scene text: replace @name with styled <span> for character mentions.
   * If the snapshot has character data, adds a title attribute with description.
   */
  renderSceneText(text: string): string {
    const snap = this.snapshot();
    const chars = snap?.characters ?? {};

    return text.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      const charInfo = chars[name];
      if (charInfo) {
        const displayLabel = this.escapeHtml(charInfo.displayName ?? name);
        const titleParts: string[] = [];
        if (charInfo.description) {
          titleParts.push(charInfo.description);
        }
        if (charInfo.age !== undefined) {
          titleParts.push(`Возраст: ${charInfo.age}`);
        }
        const titleAttr = titleParts.length > 0
          ? ` title="${this.escapeHtml(titleParts.join(' | '))}"` : '';
        return `<span class="mention"${titleAttr}>${displayLabel}</span>`;
      }
      const escapedName = this.escapeHtml(name);
      return `<span class="mention">${escapedName}</span>`;
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  formatSec(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
}
