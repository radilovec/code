import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  FFlowComponent,
  FCanvasComponent,
  FZoomDirective,
  FBackgroundComponent,
  FCirclePatternComponent,
} from '@foblex/flow';
import { Scenario } from '@interactive-video/shared';

@Component({
  selector: 'app-graph-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowComponent,
    FCanvasComponent,
    FZoomDirective,
    FBackgroundComponent,
    FCirclePatternComponent,
  ],
  templateUrl: './graph-view.component.html',
  styleUrl: './graph-view.component.scss',
})
export class GraphViewComponent {
  readonly model = input<Scenario | null>(null);
  readonly selectedSceneId = input<string | null>(null);
  readonly sceneSelected = output<string>();

  private readonly fFlow = viewChild(FFlowComponent);

  fitToScreen(): void {
    // T5.2 — will implement fitToFlow after nodes are rendered
  }
}
