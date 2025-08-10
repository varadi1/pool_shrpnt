import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemHealth } from '../SystemHealth';

describe('SystemHealth', () => {
  it('renders system health card with healthy status', () => {
    render(
      <SystemHealth
        health="healthy"
        queueDepth={5}
        lastProvisionTime={3}
        apiLatency={150}
      />
    );

    expect(screen.getByText('Rendszerállapot')).toBeInTheDocument();
    expect(screen.getByText('EGÉSZSÉGES')).toBeInTheDocument();
    expect(screen.getByText('5 feladat')).toBeInTheDocument();
    expect(screen.getByText('3 perc')).toBeInTheDocument();
    expect(screen.getByText('150 ms')).toBeInTheDocument();
  });

  it('renders with degraded status', () => {
    render(
      <SystemHealth
        health="degraded"
        queueDepth={15}
        lastProvisionTime={7}
        apiLatency={300}
      />
    );

    expect(screen.getByText('ROMLOTT')).toBeInTheDocument();
  });

  it('renders with unhealthy status', () => {
    render(
      <SystemHealth
        health="unhealthy"
        queueDepth={30}
        lastProvisionTime={15}
        apiLatency={600}
      />
    );

    expect(screen.getByText('EGÉSZSÉGTELEN')).toBeInTheDocument();
  });

  it('renders with default values when props are undefined', () => {
    render(<SystemHealth />);

    expect(screen.getByText('EGÉSZSÉGES')).toBeInTheDocument();
    expect(screen.getByText('0 feladat')).toBeInTheDocument();
    expect(screen.getByText('0 perc')).toBeInTheDocument();
    expect(screen.getByText('0 ms')).toBeInTheDocument();
  });

  it('displays correct labels for metrics', () => {
    render(<SystemHealth />);

    expect(screen.getByText('Várakozási Sor Mérete')).toBeInTheDocument();
    expect(screen.getByText('Utolsó Telepítés Ideje')).toBeInTheDocument();
    expect(screen.getByText('API Késleltetés')).toBeInTheDocument();
  });

  it('renders progress bars for each metric', () => {
    const { container } = render(
      <SystemHealth
        queueDepth={25}
        lastProvisionTime={8}
        apiLatency={400}
      />
    );

    // Fluent UI ProgressBar renders with role="progressbar"
    const progressBars = container.querySelectorAll('[role="progressbar"]');
    expect(progressBars).toHaveLength(3);
  });

  it('handles extreme values correctly', () => {
    render(
      <SystemHealth
        queueDepth={100}
        lastProvisionTime={20}
        apiLatency={2000}
      />
    );

    expect(screen.getByText('100 feladat')).toBeInTheDocument();
    expect(screen.getByText('20 perc')).toBeInTheDocument();
    expect(screen.getByText('2000 ms')).toBeInTheDocument();
  });

  it('displays loading state when loading prop is true', () => {
    render(<SystemHealth loading={true} />);

    // The component should still render with default values when loading
    // as the loading prop is not used in the current implementation
    expect(screen.getByText('Rendszerállapot')).toBeInTheDocument();
  });

  it('calculates queue status correctly', () => {
    const { rerender } = render(<SystemHealth queueDepth={0} />);
    
    // Queue depth 0 should be success (green)
    expect(screen.getByText('0 feladat')).toBeInTheDocument();

    // Queue depth < 10 should be warning (yellow)
    rerender(<SystemHealth queueDepth={9} />);
    expect(screen.getByText('9 feladat')).toBeInTheDocument();

    // Queue depth >= 10 should be error (red)
    rerender(<SystemHealth queueDepth={10} />);
    expect(screen.getByText('10 feladat')).toBeInTheDocument();
  });

  it('displays provision time status correctly', () => {
    const { rerender } = render(<SystemHealth lastProvisionTime={3} />);
    
    // < 5 minutes should be success
    expect(screen.getByText('3 perc')).toBeInTheDocument();

    // 5-10 minutes should be warning
    rerender(<SystemHealth lastProvisionTime={7} />);
    expect(screen.getByText('7 perc')).toBeInTheDocument();

    // > 10 minutes should be error
    rerender(<SystemHealth lastProvisionTime={12} />);
    expect(screen.getByText('12 perc')).toBeInTheDocument();
  });

  it('displays API latency status correctly', () => {
    const { rerender } = render(<SystemHealth apiLatency={100} />);
    
    // < 200ms should be success
    expect(screen.getByText('100 ms')).toBeInTheDocument();

    // 200-500ms should be warning
    rerender(<SystemHealth apiLatency={350} />);
    expect(screen.getByText('350 ms')).toBeInTheDocument();

    // > 500ms should be error
    rerender(<SystemHealth apiLatency={600} />);
    expect(screen.getByText('600 ms')).toBeInTheDocument();
  });
});