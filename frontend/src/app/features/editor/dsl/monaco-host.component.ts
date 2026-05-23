import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';
import { MonacoLoaderService } from './monaco-loader.service';
import { registerStoryDsl } from './storydsl.language';

declare const monaco: typeof import('monaco-editor');

@Component({
  selector: 'app-monaco-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monaco-host.component.html',
  styleUrl: './monaco-host.component.scss',
})
export class MonacoHostComponent {
  readonly initialValue = input.required<string>();
  readonly save = output<string>();
  readonly contentChange = output<string>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly loader = inject(MonacoLoaderService);
  private readonly containerRef = viewChild<ElementRef<HTMLDivElement>>('editorContainer');

  private editor: ReturnType<typeof monaco.editor.create> | null = null;
  private readonly saveSubject = new Subject<string>();
  private readonly changeSubject = new Subject<string>();

  readonly ready = signal(false);

  constructor() {
    this.setupAutoSave();
    this.setupContentChange();
    // Defer Monaco init until after the view is rendered so that containerRef()
    // (viewChild) is available even when the AMD loader resolves synchronously
    // (i.e. Monaco is already cached from a previous navigation).
    afterNextRender(() => {
      this.initMonaco();
    });
  }

  private initMonaco(): void {
    this.loader.load().pipe(
      take(1),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      registerStoryDsl();
      this.createEditor();
    });
  }

  private createEditor(): void {
    const ref = this.containerRef();
    if (!ref) return;
    const container = ref.nativeElement;

    this.editor = monaco.editor.create(container, {
      value: this.initialValue(),
      language: 'storydsl',
      theme: 'storydsl-dark',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
      lineHeight: 22,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      renderWhitespace: 'none',
      wordWrap: 'off',
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
    });

    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => this.triggerSave(),
    );

    this.editor.onDidChangeModelContent(() => {
      const value = this.editor!.getValue();
      this.changeSubject.next(value);
    });

    this.ready.set(true);

    this.destroyRef.onDestroy(() => {
      this.editor?.dispose();
      this.editor = null;
    });
  }

  private setupAutoSave(): void {
    this.saveSubject.pipe(
      debounceTime(500),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(value => {
      this.save.emit(value);
    });
  }

  private setupContentChange(): void {
    this.changeSubject.pipe(
      debounceTime(150),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(value => {
      this.contentChange.emit(value);
    });
  }

  private triggerSave(): void {
    if (!this.editor) return;
    const value = this.editor.getValue();
    this.saveSubject.next(value);
  }

  getEditor(): typeof this.editor {
    return this.editor;
  }

  getValue(): string {
    return this.editor?.getValue() ?? '';
  }

  setValue(value: string): void {
    if (this.editor && this.editor.getValue() !== value) {
      this.editor.setValue(value);
    }
  }

  setMarkers(markers: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }>): void {
    if (!this.editor) return;
    const model = this.editor.getModel();
    if (!model) return;

    const monacoMarkers = markers.map(m => ({
      severity: m.severity === 'error'
        ? monaco.MarkerSeverity.Error
        : m.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
      message: m.message,
      startLineNumber: m.startLineNumber,
      startColumn: m.startColumn,
      endLineNumber: m.endLineNumber,
      endColumn: m.endColumn,
    }));

    monaco.editor.setModelMarkers(model, 'storydsl', monacoMarkers);
  }

  revealLine(line: number): void {
    if (!this.editor) return;
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.focus();
  }
}
