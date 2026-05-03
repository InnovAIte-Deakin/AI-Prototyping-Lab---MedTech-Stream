import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}}>Content</Modal>);
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('renders children when open', () => {
    render(<Modal open onClose={() => {}}>Modal body</Modal>);
    expect(screen.getByText('Modal body')).toBeInTheDocument();
  });

  it('renders title in header', () => {
    render(<Modal open onClose={() => {}} title="Share Report">Body</Modal>);
    expect(screen.getByText('Share Report')).toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose}>Content</Modal>);
    const overlay = screen.getByTestId('modal-overlay');
    await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose}>Content</Modal>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('has accessible dialog role', () => {
    render(<Modal open onClose={() => {}} title="Test">Body</Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('applies modal panel class', () => {
    render(<Modal open onClose={() => {}}>Content</Modal>);
    expect(screen.getByRole('dialog')).toHaveClass('modal-panel');
  });
});
