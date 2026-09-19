import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorScreen } from './error-screen';

const failure = new Error('Cannot read property "bids" of undefined');

describe('ErrorScreen', () => {
  it('explains the failure and offers a way out', async () => {
    const onRetry = jest.fn();
    await render(<ErrorScreen error={failure} onRetry={onRetry} showDetails={false} />);

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the raw error away from users', async () => {
    await render(<ErrorScreen error={failure} onRetry={jest.fn()} showDetails={false} />);

    expect(screen.queryByText(failure.message)).not.toBeOnTheScreen();
  });

  it('shows the raw error to developers', async () => {
    await render(<ErrorScreen error={failure} onRetry={jest.fn()} showDetails />);

    expect(screen.getByText(failure.message)).toBeOnTheScreen();
  });
});
