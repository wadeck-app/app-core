import React from 'react';
import { ButtonAction } from '@wadeck-app/dsl-ui';
import { getErrorMessage } from './errors.js';

interface Props {
  moduleId: string;
  // The label of the page in the menu, or its path when it has none.
  pageLabel: string;
  children: React.ReactNode;
}

interface State {
  message?: string;
}

// A page of a module that throws while it renders must not blank the whole app (React unmounts the entire tree of an error nobody catches:
// the menu, the top bar, everything). The failure stays in the page: what failed, where, and who has to fix it. The page is keyed by the
// caller, so going to another page starts over.
export class PageErrorBoundary extends React.Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { message: getErrorMessage(error) };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error(`[app-core] the page "${this.props.pageLabel}" of module "${this.props.moduleId}" threw while rendering:`, error, info.componentStack);
  }

  override render(): React.ReactNode {
    const { message } = this.state;
    if (message === undefined) {
      return this.props.children;
    }
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-danger bg-surface p-4 text-sm">
        <h2 className="text-base font-semibold text-danger">This page failed to render</h2>
        <p className="text-content">
          {`The page "${this.props.pageLabel}" of the module "${this.props.moduleId}" threw an error while it was drawn. The rest of app-core still works: use the menu to go elsewhere.`}
        </p>
        <pre className="whitespace-pre-wrap break-words rounded bg-muted-bg p-2 text-xs text-content">{message}</pre>
        <p className="text-muted">{`This is a defect of the module "${this.props.moduleId}" (its view or one of its components): report it to its owner with the message above. The stack is in the browser console, prefixed "[app-core]".`}</p>
        <ButtonAction label="Try again" variant="secondary" onClick={() => this.setState({ message: undefined })} />
      </div>
    );
  }
}
