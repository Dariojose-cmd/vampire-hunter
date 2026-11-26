/**
 * Uploader file-type dispatch tests (spec excel-statement-support, task 7.6).
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.4, 2.5, 4.1, 4.3, 4.4, 5.1, 5.3, 5.4
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Uploader } from '@components/Uploader';

const { readWorkbook, factory } = vi.hoisted(() => {
  const readWorkbook = vi.fn();
  const factory = vi.fn(() => ({ readWorkbook }));
  return { readWorkbook, factory };
});

vi.mock('../src/engine/excelReader', () => factory());

function file(name: string, content = 'x', type = '') {
  return new File([content], name, { type });
}

function setup() {
  const onCsv = vi.fn();
  const onParseError = vi.fn();
  const utils = render(<Uploader language="en" onCsv={onCsv} onParseError={onParseError} />);
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
  const upload = (f: File) => userEvent.upload(input, f, { applyAccept: false });
  return { onCsv, onParseError, input, upload };
}

beforeEach(() => {
  readWorkbook.mockReset();
  factory.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('Uploader file dispatch', () => {
  it.each(['statement.xlsx', 'statement.xls'])('%s dispatches to the Excel path', async (name) => {
    readWorkbook.mockResolvedValue({ ok: true, csvText: 'Date,Amount\n2024-01-01,-5' });
    const { onCsv, onParseError, upload } = setup();
    await upload(file(name));
    await waitFor(() => expect(onCsv).toHaveBeenCalledTimes(1));
    expect(onCsv).toHaveBeenCalledWith(name, 'Date,Amount\n2024-01-01,-5');
    expect(readWorkbook).toHaveBeenCalledTimes(1);
    expect(onParseError).not.toHaveBeenCalled();
  });

  it('pdf reports pdfNotSupported and never loads the Excel module', async () => {
    const { onCsv, onParseError, upload } = setup();
    await upload(file('statement.pdf', 'x', 'application/pdf'));
    expect(onParseError).toHaveBeenCalledWith('errors.pdfNotSupported');
    expect(onCsv).not.toHaveBeenCalled();
    expect(readWorkbook).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('unknown extension reports fileNotCsv', async () => {
    const { onCsv, onParseError, upload } = setup();
    await upload(file('notes.txt', 'x', 'text/plain'));
    expect(onParseError).toHaveBeenCalledWith('errors.fileNotCsv');
    expect(onCsv).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it('a failure Result reports parseFailed and a later csv still works', async () => {
    readWorkbook.mockResolvedValue({ ok: false, error: 'corrupt' });
    const { onCsv, onParseError, upload } = setup();
    await upload(file('bad.xlsx'));
    await waitFor(() => expect(onParseError).toHaveBeenCalledWith('errors.parseFailed'));
    expect(onCsv).not.toHaveBeenCalled();

    await upload(file('ok.csv', 'Date,Amount\n2024-01-01,-5'));
    await waitFor(() => expect(onCsv).toHaveBeenCalledTimes(1));
    expect(onCsv.mock.calls[0][0]).toBe('ok.csv');
  });

  it('an error then a valid Excel file still works', async () => {
    const { onCsv, onParseError, upload } = setup();
    await upload(file('notes.txt'));
    expect(onParseError).toHaveBeenCalledWith('errors.fileNotCsv');
    readWorkbook.mockResolvedValue({ ok: true, csvText: 'a,b' });
    await upload(file('good.xlsx'));
    await waitFor(() => expect(onCsv).toHaveBeenCalledWith('good.xlsx', 'a,b'));
  });

  it('accepts .csv, .xlsx and .xls in the file input', () => {
    const { input } = setup();
    const accept = input.getAttribute('accept') ?? '';
    for (const ext of ['.csv', '.xlsx', '.xls']) expect(accept.split(',')).toContain(ext);
  });

  it('shows no sheet picker for a multi-sheet workbook', async () => {
    readWorkbook.mockResolvedValue({ ok: true, csvText: 'Date,Amount\n2024-01-01,-5', sheetCount: 3 });
    const { onCsv, upload } = setup();
    await upload(file('multi.xlsx'));
    await waitFor(() => expect(onCsv).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
  });
});

describe('Uploader when the Excel module fails to load', () => {
  afterEach(() => {
    vi.doUnmock('../src/engine/excelReader');
    vi.resetModules();
  });

  it('reports parseFailed and recovers for a following csv', async () => {
    vi.resetModules();
    vi.doMock('../src/engine/excelReader', () => {
      throw new Error('chunk load failed');
    });
    const RTL = await import('@testing-library/react');
    const { default: ue } = await import('@testing-library/user-event');
    const { Uploader: FreshUploader } = await import('@components/Uploader');
    const onCsv = vi.fn();
    const onParseError = vi.fn();
    const { container } = RTL.render(
      <FreshUploader language="en" onCsv={onCsv} onParseError={onParseError} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await ue.upload(input, file('broken.xlsx'), { applyAccept: false });
    await RTL.waitFor(() => expect(onParseError).toHaveBeenCalledWith('errors.parseFailed'));
    expect(onCsv).not.toHaveBeenCalled();

    await ue.upload(input, file('ok.csv', 'Date,Amount\n2024-01-01,-5'), { applyAccept: false });
    await RTL.waitFor(() => expect(onCsv).toHaveBeenCalledTimes(1));
    RTL.cleanup();
  });
});
