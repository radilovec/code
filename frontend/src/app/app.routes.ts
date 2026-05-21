import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/projects', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.page').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register.page').then(
        (m) => m.RegisterPageComponent,
      ),
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./features/projects/projects-list.page').then(
        (m) => m.ProjectsListPageComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'editor/:id',
    loadComponent: () =>
      import('./features/editor/editor.page').then(
        (m) => m.EditorPageComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'play/:publicId',
    loadComponent: () =>
      import('./features/player/player.page').then(
        (m) => m.PlayerPageComponent,
      ),
  },
  { path: '**', redirectTo: '/projects' },
];
