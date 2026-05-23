import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Scene } from '@interactive-video/shared';

@Component({
  selector: 'app-scene-props',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scene-props.component.html',
  styleUrl: './scene-props.component.scss',
})
export class ScenePropsComponent {
  readonly scene = input.required<Scene>();

  /** Emitted when the user clicks the "close" button. */
  readonly close = output<void>();

  /** Emitted when the user clicks "Open in DSL". */
  readonly jumpToDsl = output<void>();

  readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('videoRef');
  readonly isPlaying = signal(false);
  readonly videoDuration = signal(0);

  constructor() {
    // Reset video position whenever scene or video ref changes
    effect(() => {
      const seg = this.scene().video;
      const el = this.videoRef()?.nativeElement;
      if (!el || !seg) {
        this.isPlaying.set(false);
        this.videoDuration.set(0);
        return;
      }
      el.pause();
      if (isFinite(seg.from)) el.currentTime = seg.from;
      this.isPlaying.set(false);
    });
  }

  onVideoMetadataLoaded(): void {
    const el = this.videoRef()?.nativeElement;
    const seg = this.scene().video;
    if (!el || !seg) return;
    this.videoDuration.set(el.duration);
    if (isFinite(seg.from)) el.currentTime = seg.from;
  }

  onTimeUpdate(): void {
    const el = this.videoRef()?.nativeElement;
    const seg = this.scene().video;
    if (!el || !seg || !isFinite(seg.to)) return;
    if (el.currentTime >= seg.to) {
      el.pause();
      el.currentTime = seg.from;
      this.isPlaying.set(false);
    }
  }

  togglePreview(): void {
    const el = this.videoRef()?.nativeElement;
    if (!el) return;
    if (this.isPlaying()) {
      el.pause();
      this.isPlaying.set(false);
    } else {
      el.play().then(
        () => this.isPlaying.set(true),
        () => this.isPlaying.set(false),
      );
    }
  }

  clipLeft(): string {
    const dur = this.videoDuration();
    const seg = this.scene().video;
    if (!dur || !seg) return '0%';
    return `${(seg.from / dur) * 100}%`;
  }

  clipRight(): string {
    const dur = this.videoDuration();
    const seg = this.scene().video;
    if (!dur || !seg) return '0%';
    return `${((dur - seg.to) / dur) * 100}%`;
  }

  sceneTypeLabel(type: string): string {
    switch (type) {
      case 'ending': return 'Концовка';
      case 'choice': return 'Развилка';
      default: return 'Сцена';
    }
  }

  /** Format seconds → MM:SS */
  formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /** Format timecode range with duration: "MM:SS → MM:SS · Xс" */
  formatRange(from: number, to: number): string {
    const dur = Math.round(to - from);
    return `${this.formatTime(from)} → ${this.formatTime(to)} · ${dur}с`;
  }
}
