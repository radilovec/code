import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, timer, take, switchMap, tap } from 'rxjs';
import type { Scene, Variable } from '@interactive-video/shared';
import { EditorApiService } from '../editor.api';

export interface PublishDialogData {
  projectId: string;
  scenes: Scene[];
  variables: Variable[];
  warnings: Scene[];
}

export interface PublishResult {
  version: number;
  publicId: string;
  sceneCount: number;
  choiceCount: number;
}

@Component({
  selector: 'app-publish-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './publish-dialog.component.html',
  styleUrl: './publish-dialog.component.scss',
})
export class PublishDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PublishDialogComponent>);
  private readonly api = inject(EditorApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = inject<PublishDialogData>(MAT_DIALOG_DATA);

  readonly descriptionControl = new FormControl<string>('');

  readonly scenesCount = this.data.scenes.length;
  readonly choicesCount = this.data.scenes.reduce(
    (sum, s) => sum + s.choices.length,
    0,
  );
  readonly variablesCount = this.data.variables.length;
  readonly endingsCount = this.data.scenes.filter(s => s.type === 'ending').length;

  readonly descriptionLength = toSignal(
    this.descriptionControl.valueChanges.pipe(map(v => (v ?? '').length)),
    { initialValue: 0 },
  );

  readonly publishing = signal(false);
  readonly publishResult = signal<PublishResult | null>(null);
  readonly copied = signal(false);

  readonly playUrl = computed(() => {
    const result = this.publishResult();
    if (!result) return '';
    return `${window.location.origin}/play/${result.publicId}`;
  });

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.confirm();
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    if (this.publishing() || this.publishResult()) return;

    this.publishing.set(true);
    this.api.publish(this.data.projectId).pipe(
      take(1),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (result) => {
        this.publishing.set(false);
        this.publishResult.set(result);
      },
      error: () => {
        this.publishing.set(false);
      },
    });
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.playUrl());
    this.copied.set(true);
    timer(2000).pipe(
      take(1),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.copied.set(false));
  }
}
