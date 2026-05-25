import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';

export interface NewProjectResult {
  name: string;
  description?: string;
  dslText: string;
  openAfterCreate: boolean;
}

const EMPTY_DSL = `scene start {
  text "Начало истории…"

  choice "Продолжить" -> end
}

scene end {
  text "Конец."
}
`;

const DEMO_DSL = `set courage = 0
set found_key = false

character mentor {
  description "Опытный детектив, ваш напарник"
}

scene intro {
  video "https://example.com/video/intro.mp4" from 0 to 15
  text "Вы входите в тёмный офис после полуночи."

  choice "Осмотреться" -> look_around
  choice "Идти к лифту" -> elevator
}

scene look_around {
  text "На столе лежит ключ от сейфа."
  set courage = 1

  choice "Взять ключ" -> take_key
  choice "Игнорировать" -> elevator
}

scene take_key {
  set found_key = true
  text "Вы подобрали ключ."

  goto elevator
}

scene elevator {
  text "Лифт не работает. Что делать?"

  choice "Открыть сейф" -> safe_open when found_key
  choice "Взломать дверь" -> safe_open when courage >= 1
  choice "Уйти через лестницу" -> stairs_end
}

scene safe_open {
  video "https://example.com/video/safe.mp4" from 15 to 30
  text "В сейфе — документы с компроматом."

  if found_key {
    choice "Изучить документы" -> end_truth
  } else {
    choice "Забрать всё" -> end_truth
  }
}

scene stairs_end {
  text "Вы уходите, не узнав правды."
}

scene end_truth {
  text "Правда раскрыта. Дело закрыто."
}
`;

@Component({
  selector: 'app-new-project-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './new-project-dialog.component.html',
  styleUrl: './new-project-dialog.component.scss',
})
export class NewProjectDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NewProjectDialogComponent>);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    description: new FormControl('', { nonNullable: true }),
    template: new FormControl<'empty' | 'demo'>('empty', { nonNullable: true }),
    openAfterCreate: new FormControl(true, { nonNullable: true }),
  });

  close(): void {
    this.dialogRef.close(null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, description, template, openAfterCreate } = this.form.getRawValue();
    const result: NewProjectResult = {
      name,
      description: description || undefined,
      dslText: template === 'demo' ? DEMO_DSL : EMPTY_DSL,
      openAfterCreate,
    };
    this.dialogRef.close(result);
  }
}
