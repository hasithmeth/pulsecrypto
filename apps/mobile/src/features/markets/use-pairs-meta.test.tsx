import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { requestJson } from '@/core/api/http-client';
import { usePairsMetaRefresh } from './use-pairs-meta';

jest.mock('@/core/api/http-client', () => ({
  ...jest.requireActual<object>('@/core/api/http-client'),
  requestJson: jest.fn(),
}));

const request = jest.mocked(requestJson);

const advance = (ms: number): Promise<void> =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function renderRefresh() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = await renderHook(() => usePairsMetaRefresh(), { wrapper });
  await advance(0);
  return view;
}

beforeEach(() => {
  jest.useFakeTimers();
  request.mockReset();
  request.mockResolvedValue({ pairs: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePairsMetaRefresh', () => {
  it('refetches the metadata and keeps the indicator up long enough to be seen', async () => {
    const { result } = await renderRefresh();
    expect(request).toHaveBeenCalledTimes(1);

    await act(() => {
      result.current.refresh();
    });
    expect(result.current.refreshing).toBe(true);

    await advance(599);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.refreshing).toBe(true);

    await advance(1);
    expect(result.current.refreshing).toBe(false);
  });

  it('keeps the indicator up until a slow request finishes', async () => {
    const { result } = await renderRefresh();
    let finish: (value: { pairs: [] }) => void = () => undefined;
    request.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    await act(() => {
      result.current.refresh();
    });
    await advance(2_000);
    expect(result.current.refreshing).toBe(true);

    finish({ pairs: [] });
    await advance(0);
    expect(result.current.refreshing).toBe(false);
  });
});
