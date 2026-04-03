'use client';

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  hasError: boolean;
}

export class GameErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Game crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative w-full max-w-4xl mx-auto aspect-video bg-black border-4 border-red-500 flex flex-col items-center justify-center gap-6">
          <h2 className="font-arcade text-2xl text-red-500 neon-text">SYSTEM ERROR</h2>
          <p className="font-arcade text-xs text-white/60">Something broke. Even the AI is embarrassed.</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
            className="font-arcade px-6 py-3 text-sm border-2 border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black transition-all"
          >
            RESTART
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
