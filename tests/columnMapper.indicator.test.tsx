import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ColumnMapper } from '@components/ColumnMapper';
import { classifyIndicator } from '@engine/parser';

afterEach(cleanup);
const headers = ['Datum', 'Text', 'Soll/Haben', 'Betrag'];

describe('ColumnMapper indicator column', () => {
  it('classifies Soll/Haben values', () => {
    expect(classifyIndicator('S')).toBe('debit');
    expect(classifyIndicator('H')).toBe('credit');
  });

  it('includes the chosen indicator column in the single layout', () => {
    const onConfirm = vi.fn();
    render(<ColumnMapper language="en" headers={headers} dateFormatAmbiguous={false} onCancel={() => {}} onConfirm={onConfirm} />);
    fireEvent.change(document.getElementById('map-date')!, { target: { value: '0' } });
    fireEvent.change(document.getElementById('map-desc')!, { target: { value: '1' } });
    fireEvent.change(document.getElementById('map-amount')!, { target: { value: '3' } });
    fireEvent.change(document.getElementById('map-indicator')!, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /hunt for vampires/i }));
    expect(onConfirm.mock.calls[0][0]).toEqual({ type: 'single', amountCol: 3, dateCol: 0, descCol: 1, indicatorCol: 2 });
  });

  it('pre-selects a detected indicator column', () => {
    render(<ColumnMapper language="en" headers={headers} dateFormatAmbiguous={false} detectedIndicatorCol={2} onCancel={() => {}} onConfirm={() => {}} />);
    fireEvent.change(document.getElementById('map-amount')!, { target: { value: '3' } });
    expect((document.getElementById('map-indicator') as HTMLSelectElement).value).toBe('2');
  });
});
