import { readdirSync } from 'node:fs';
import path from 'node:path';

type PathApi = Pick<typeof path, 'relative' | 'sep'>;

/**
 * The Expo Router route name of a screen file: its path relative to the app
 * directory, always with `/` separators (route semantics, never the OS
 * separator — on Windows `path.relative` returns `children\[id]`) and without
 * the extension. `pathApi` lets tests prove the Windows form on any OS.
 */
export function routeName(appDir: string, file: string, pathApi: PathApi = path): string {
  return pathApi
    .relative(appDir, file)
    .split(pathApi.sep)
    .join('/')
    .replace(/\.tsx$/, '');
}

/**
 * The REAL route tree for renderRouter: every screen file under `appDir`
 * (tests excluded), keyed by its route name — so a missing or misnamed route,
 * or a wrong stack, shows up in tests.
 */
export function appRoutes(appDir: string): Record<string, unknown> {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.name === '__tests__'
        ? []
        : entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
    );
  return Object.fromEntries(
    walk(appDir)
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => [routeName(appDir, file), jest.requireActual(file).default]),
  );
}
