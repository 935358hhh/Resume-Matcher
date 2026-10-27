import { fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import {
  APPLICATION_STATUS_ORDER,
  type Application,
  type ApplicationStatus,
} from '@/lib/api/tracker';
import { TRACKER_HIDDEN_STATUSES_KEY } from '@/lib/utils/tracker-column-visibility';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/api/tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/tracker')>();
  const card = { application_id: 'a1', company: 'Acme', role: 'Engineer' } as Application;
  const columns = Object.fromEntries(
    actual.APPLICATION_STATUS_ORDER.map((status, i) => [status, i === 0 ? [card] : []])
  );
  return { ...actual, listApplications: vi.fn().mockResolvedValue({ columns }) };
});

describe('KanbanBoard stage jump', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    scrollIntoView.mockClear();
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  const jump = async () => {
    render(<KanbanBoard />);
    const stage = await screen.findByRole('button', {
      name: new RegExp(`tracker.columns.${APPLICATION_STATUS_ORDER[1]}`),
    });
    fireEvent.click(stage);
  };

  it('scrolls smoothly by default', async () => {
    await jump();
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('jumps instantly under reduced motion', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    await jump();
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });
});

describe('KanbanBoard scroll controls after column visibility changes', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom has no layout: model the board's fixed-width columns without
    // dispatching scroll or resize events when their visibility changes.
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.querySelectorAll('[data-column]').length * 320;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const toggleStage = (status: ApplicationStatus) => {
    fireEvent.click(
      screen.getByRole('switch', { name: new RegExp(`^tracker\\.columns\\.${status}`) })
    );
  };

  it('removes the controls and overflow hint when hidden columns make the board fit', async () => {
    render(<KanbanBoard />);
    expect(await screen.findByRole('button', { name: 'tracker.scroll.next' })).toBeEnabled();
    expect(screen.getByText('tracker.scroll.hint')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'tracker.manage' }));
    for (const status of APPLICATION_STATUS_ORDER.slice(1)) toggleStage(status);

    expect(screen.queryByRole('button', { name: 'tracker.scroll.prev' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tracker.scroll.next' })).not.toBeInTheDocument();
    expect(screen.queryByText('tracker.scroll.hint')).not.toBeInTheDocument();
  });

  it('restores the controls and overflow hint when re-shown columns overflow', async () => {
    localStorage.setItem(
      TRACKER_HIDDEN_STATUSES_KEY,
      JSON.stringify(APPLICATION_STATUS_ORDER.slice(1))
    );
    render(<KanbanBoard />);
    await screen.findByText('Acme');
    expect(screen.queryByRole('button', { name: 'tracker.scroll.next' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'tracker.manage' }));
    toggleStage('applied');
    expect(screen.queryByRole('button', { name: 'tracker.scroll.next' })).not.toBeInTheDocument();
    toggleStage('interview');

    expect(screen.getByRole('button', { name: 'tracker.scroll.next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'tracker.scroll.prev' })).toBeDisabled();
    expect(screen.getByText('tracker.scroll.hint')).toBeInTheDocument();
  });
});
