import {
  ArchiveRestore,
  Bold,
  BriefcaseMedical,
  CheckCircle2,
  ChevronLeft,
  Highlighter,
  List,
  ListOrdered,
  LoaderCircle,
  NotebookPen,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  formatDisplayName,
  getChoiceLabel,
} from '../data/mockData';
import type { NotebookDocument, SavedIntervention, Senior } from '../types';
import {
  readLegacyNotebookRecovery,
  resolveLegacyNotebookRecovery,
} from '../utils/legacyNotebookRecovery';

function formatLongDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatShortTime(value: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

function formatSaveTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  const isSameDay = date.toDateString() === today.toDateString();

  return isSameDay
    ? `aujourd’hui à ${formatShortTime(date)}`
    : `${formatLongDate(value.slice(0, 10))} à ${formatShortTime(date)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNotebookSenior(senior: Senior | null | undefined) {
  if (!senior) {
    return 'Dr non renseigné';
  }

  const lastName = senior.lastName.trim();
  const displayName = formatDisplayName(senior.firstName, senior.lastName);

  if (lastName.length > 0) {
    return `Dr ${lastName}`;
  }

  return displayName ? `Dr ${displayName}` : 'Dr non renseigné';
}

const NOTEBOOK_HIGHLIGHT_COLOR = '#fff0c8';
const NOTEBOOK_SAVE_DELAY_MS = 500;

function normalizeCommandColor(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function getNotebookTextPreview(contentHtml: string) {
  const textContent = contentHtml
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>|<\/div>|<\/li>|<\/section>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!textContent) {
    return 'Cette copie contient uniquement de la mise en forme.';
  }

  return textContent.length > 220
    ? `${textContent.slice(0, 217)}…`
    : textContent;
}

export function NotebookScreen() {
  const {
    selectedInternal,
    notebookDocuments,
    savedInterventions,
    selectableSeniors,
    surgicalProcedureOptions,
    backToWelcome,
    updateNotebookDocument,
    clearNotebookDocument,
  } = useAppContext();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const confirmedContentRef = useRef('');
  const latestContentRef = useRef('');
  const requestedContentRef = useRef('');
  const activeSaveCountRef = useRef(0);
  const saveAttemptRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const updateNotebookDocumentRef = useRef(updateNotebookDocument);
  updateNotebookDocumentRef.current = updateNotebookDocument;
  const [isInterventionPanelOpen, setIsInterventionPanelOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [editorAlert, setEditorAlert] = useState<string | null>(null);
  const [legacyNotebookRecovery, setLegacyNotebookRecovery] =
    useState<NotebookDocument | null>(null);
  const [legacyRecoveryState, setLegacyRecoveryState] = useState<
    'idle' | 'keeping-supabase' | 'restoring'
  >('idle');
  const [legacyRecoveryFeedback, setLegacyRecoveryFeedback] = useState<{
    kind: 'error' | 'success';
    message: string;
  } | null>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    underline: false,
    highlight: false,
    unorderedList: false,
    orderedList: false,
  });

  const notebookDocument = selectedInternal
    ? notebookDocuments.find(
        (document) => document.internalId === selectedInternal.id
      )
    : null;
  const latestInterventions = useMemo(() => {
    if (!selectedInternal) {
      return [];
    }

    return savedInterventions
      .filter((intervention) => intervention.internalId === selectedInternal.id)
      .sort((left, right) => {
        const savedAtDelta = right.savedAt.localeCompare(left.savedAt);

        return savedAtDelta !== 0 ? savedAtDelta : right.date.localeCompare(left.date);
      })
      .slice(0, 3);
  }, [savedInterventions, selectedInternal]);
  const legacyNotebookPreview = useMemo(
    () =>
      legacyNotebookRecovery
        ? getNotebookTextPreview(legacyNotebookRecovery.contentHtml)
        : '',
    [legacyNotebookRecovery]
  );

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || !selectedInternal) {
      return;
    }

    const contentHtml = notebookDocument?.contentHtml ?? '';
    editor.innerHTML = contentHtml;
    confirmedContentRef.current = contentHtml;
    latestContentRef.current = contentHtml;
    requestedContentRef.current = contentHtml;
    saveAttemptRef.current += 1;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveState(notebookDocument?.updatedAt ? 'saved' : 'idle');
    setEditorAlert(null);
  }, [selectedInternal?.id]);

  useEffect(() => {
    if (!selectedInternal) {
      setLegacyNotebookRecovery(null);
      return;
    }

    try {
      setLegacyNotebookRecovery(
        readLegacyNotebookRecovery(
          selectedInternal.id,
          notebookDocument?.contentHtml ?? ''
        )
      );
    } catch {
      setLegacyNotebookRecovery(null);
      setLegacyRecoveryFeedback({
        kind: 'error',
        message:
          'La copie locale historique du bloc-notes ne peut pas être lue sur cet appareil.',
      });
    }
  }, [notebookDocument?.contentHtml, selectedInternal?.id]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const pendingContent = latestContentRef.current;

      if (
        pendingContent !== confirmedContentRef.current &&
        pendingContent !== requestedContentRef.current
      ) {
        void updateNotebookDocumentRef.current(pendingContent).catch(() => undefined);
      }
    };
  }, []);

  const syncActiveFormats = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection?.rangeCount) {
      setActiveFormats({
        bold: false,
        underline: false,
        highlight: false,
        unorderedList: false,
        orderedList: false,
      });
      return;
    }

    const anchorElement =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode?.parentElement ?? null;

    if (!anchorElement || !editor.contains(anchorElement)) {
      setActiveFormats({
        bold: false,
        underline: false,
        highlight: false,
        unorderedList: false,
        orderedList: false,
      });
      return;
    }

    const readCommandState = (command: string) => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };

    let highlightValue = '';

    try {
      highlightValue = String(
        document.queryCommandValue('hiliteColor') ||
          document.queryCommandValue('backColor') ||
          ''
      );
    } catch {
      highlightValue = '';
    }

    const normalizedHighlightValue = normalizeCommandColor(highlightValue);

    setActiveFormats({
      bold: readCommandState('bold'),
      underline: readCommandState('underline'),
      highlight:
        normalizedHighlightValue === normalizeCommandColor(NOTEBOOK_HIGHLIGHT_COLOR) ||
        normalizedHighlightValue === 'rgb(255,240,200)' ||
        normalizedHighlightValue === 'rgba(255,240,200,1)',
      unorderedList: readCommandState('insertUnorderedList'),
      orderedList: readCommandState('insertOrderedList'),
    });
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      syncActiveFormats();
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  if (!selectedInternal) {
    return null;
  }

  const persistNotebookContent = async (
    contentHtml: string,
    attemptId: number,
    saveDocument: () => Promise<NotebookDocument> = () =>
      updateNotebookDocument(contentHtml)
  ) => {
    requestedContentRef.current = contentHtml;
    activeSaveCountRef.current += 1;

    try {
      const confirmedDocument = await saveDocument();
      confirmedContentRef.current = confirmedDocument.contentHtml;

      if (!isMountedRef.current || attemptId !== saveAttemptRef.current) {
        return true;
      }

      const currentEditorContent = editorRef.current?.innerHTML ?? '';
      if (currentEditorContent === confirmedDocument.contentHtml) {
        setSaveState('saved');
        setEditorAlert(null);
      } else {
        setSaveState('saving');
      }

      return true;
    } catch {
      if (!isMountedRef.current || attemptId !== saveAttemptRef.current) {
        return false;
      }

      setSaveState('error');
      setEditorAlert(
        'Le bloc-notes n’a pas été enregistré dans Supabase. Le contenu reste affiché sur cette page : vérifie la connexion puis réessaie.'
      );
      return false;
    } finally {
      activeSaveCountRef.current = Math.max(0, activeSaveCountRef.current - 1);
    }
  };

  const persistEditorContent = (immediate = false) => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const contentHtml = editor.innerHTML;
    latestContentRef.current = contentHtml;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const attemptId = saveAttemptRef.current + 1;
    saveAttemptRef.current = attemptId;

    if (
      contentHtml === confirmedContentRef.current &&
      activeSaveCountRef.current === 0
    ) {
      setSaveState(notebookDocument?.updatedAt ? 'saved' : 'idle');
      setEditorAlert(null);
      return;
    }

    setSaveState('saving');
    setEditorAlert(null);

    if (immediate) {
      void persistNotebookContent(contentHtml, attemptId);
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistNotebookContent(contentHtml, attemptId);
    }, NOTEBOOK_SAVE_DELAY_MS);
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const handleToolbarPointerDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const runCommand = (command: string, value?: string) => {
    focusEditor();

    try {
      const didRun = document.execCommand(command, false, value);

      if (!didRun) {
        setSaveState('error');
        setEditorAlert(
          'Cette action de mise en forme n’est pas disponible sur ce navigateur.'
        );
        return;
      }
    } catch {
      setSaveState('error');
      setEditorAlert(
        'Cette action de mise en forme n’est pas disponible sur ce navigateur.'
      );
      return;
    }

    persistEditorContent();
    requestAnimationFrame(syncActiveFormats);
  };

  const toggleHighlight = () => {
    focusEditor();

    let didRun = false;

    try {
      document.execCommand('styleWithCSS', false, 'true');
      didRun =
        document.execCommand(
          'hiliteColor',
          false,
          activeFormats.highlight ? 'transparent' : NOTEBOOK_HIGHLIGHT_COLOR
        ) ||
        document.execCommand(
          'backColor',
          false,
          activeFormats.highlight ? 'transparent' : NOTEBOOK_HIGHLIGHT_COLOR
        );
    } catch {
      didRun = false;
    }

    if (!didRun) {
      setSaveState('error');
      setEditorAlert(
        'Cette action de mise en forme n’est pas disponible sur ce navigateur.'
      );
      return;
    }

    persistEditorContent();
    requestAnimationFrame(syncActiveFormats);
  };

  const insertHtml = (html: string, caretMarkerId?: string) => {
    focusEditor();

    try {
      const didInsert = document.execCommand('insertHTML', false, html);

      if (!didInsert) {
        setSaveState('error');
        setEditorAlert(
          'Impossible d’insérer ce contenu automatiquement sur ce navigateur.'
        );
        return;
      }
    } catch {
      setSaveState('error');
      setEditorAlert(
        'Impossible d’insérer ce contenu automatiquement sur ce navigateur.'
      );
      return;
    }

    if (caretMarkerId) {
      const editor = editorRef.current;
      const caretTarget = editor?.querySelector<HTMLElement>(
        `[data-notebook-caret="${caretMarkerId}"]`
      );

      if (editor && caretTarget) {
        caretTarget.removeAttribute('data-notebook-caret');

        const range = document.createRange();
        range.selectNodeContents(caretTarget);
        range.collapse(true);

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        editor.focus({ preventScroll: true });
        caretTarget.scrollIntoView({ block: 'nearest' });
      }
    }

    persistEditorContent();
  };

  const insertFreeNote = () => {
    const now = new Date();
    const caretMarkerId = `notebook-caret-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    insertHtml(
      `
        <section class="notebook-entry">
          <p class="notebook-entry__date">${escapeHtml(formatLongDate(now.toISOString().slice(0, 10)))} – ${escapeHtml(formatShortTime(now))}</p>
          <p data-notebook-caret="${caretMarkerId}"><br></p>
        </section>
        <hr class="notebook-separator">
        <p><br></p>
      `,
      caretMarkerId
    );
  };

  const insertInterventionNote = (intervention: SavedIntervention) => {
    const senior =
      selectableSeniors.find((candidate) => candidate.id === intervention.seniorId) ??
      null;
    const procedureLabel = getChoiceLabel(
      surgicalProcedureOptions,
      intervention.procedure
    );
    const approachLabel = getChoiceLabel(
      approachOptions,
      intervention.approach,
      'Non renseignée'
    );
    const now = new Date();
    const caretMarkerId = `notebook-caret-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    insertHtml(
      `
        <section class="notebook-entry">
          <p>${escapeHtml(formatLongDate(intervention.date))} – <strong>${escapeHtml(procedureLabel)}</strong></p>
          <p>Voie d’abord : <strong>${escapeHtml(approachLabel)}</strong></p>
          <p>Senior : <strong>${escapeHtml(formatNotebookSenior(senior))}</strong></p>
          <p class="notebook-entry__muted">Note ajoutée à ${escapeHtml(formatShortTime(now))}</p>
          <p data-notebook-caret="${caretMarkerId}"><br></p>
        </section>
        <hr class="notebook-separator">
        <p><br></p>
      `,
      caretMarkerId
    );
    setIsInterventionPanelOpen(false);
  };

  const handleClearNotebook = () => {
    const editor = editorRef.current;
    const hasNotebookContent = Boolean(
      editor?.innerText.trim() || notebookDocument?.contentHtml.trim()
    );

    if (
      hasNotebookContent &&
      !window.confirm(
        'Vider définitivement ce bloc-notes ? Cette action sera enregistrée immédiatement.'
      )
    ) {
      return;
    }

    if (editor) {
      editor.innerHTML = '';
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    latestContentRef.current = '';
    const attemptId = saveAttemptRef.current + 1;
    saveAttemptRef.current = attemptId;
    setSaveState('saving');
    setEditorAlert(null);
    void persistNotebookContent('', attemptId, clearNotebookDocument);
  };

  const retryNotebookSave = () => {
    persistEditorContent(true);
  };

  const keepSupabaseNotebook = () => {
    if (!legacyNotebookRecovery || legacyRecoveryState !== 'idle') {
      return;
    }

    setLegacyRecoveryState('keeping-supabase');
    setLegacyRecoveryFeedback(null);

    try {
      resolveLegacyNotebookRecovery(selectedInternal.id);
      setLegacyNotebookRecovery(null);
      setLegacyRecoveryFeedback({
        kind: 'success',
        message:
          'La version Supabase est conservée. L’ancienne copie locale de ce bloc-notes a été supprimée.',
      });
    } catch {
      setLegacyRecoveryFeedback({
        kind: 'error',
        message:
          'La version Supabase reste inchangée, mais l’ancienne copie locale n’a pas pu être supprimée.',
      });
    } finally {
      setLegacyRecoveryState('idle');
    }
  };

  const restoreLegacyNotebook = async () => {
    const legacyDocument = legacyNotebookRecovery;

    if (!legacyDocument || legacyRecoveryState !== 'idle') {
      return;
    }

    if (
      !window.confirm(
        'Restaurer cette ancienne copie locale ? Le contenu actuel du bloc-notes Supabase sera remplacé uniquement après confirmation du serveur.'
      )
    ) {
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (editorRef.current) {
      editorRef.current.innerHTML = legacyDocument.contentHtml;
    }

    latestContentRef.current = legacyDocument.contentHtml;
    const attemptId = saveAttemptRef.current + 1;
    saveAttemptRef.current = attemptId;
    setLegacyRecoveryState('restoring');
    setLegacyRecoveryFeedback(null);
    setSaveState('saving');
    setEditorAlert(null);

    const wasRestored = await persistNotebookContent(
      legacyDocument.contentHtml,
      attemptId
    );

    if (!wasRestored) {
      setLegacyRecoveryState('idle');
      return;
    }

    try {
      resolveLegacyNotebookRecovery(selectedInternal.id);
      setLegacyRecoveryFeedback({
        kind: 'success',
        message:
          'L’ancienne copie locale a été restaurée dans Supabase puis supprimée de cet appareil.',
      });
    } catch {
      setLegacyRecoveryFeedback({
        kind: 'error',
        message:
          'La restauration Supabase a réussi, mais l’ancienne copie locale n’a pas pu être supprimée de cet appareil.',
      });
    } finally {
      setLegacyNotebookRecovery(null);
      setLegacyRecoveryState('idle');
    }
  };

  const lastSavedLabel = formatSaveTimestamp(notebookDocument?.updatedAt);
  const saveStatusLabel =
    saveState === 'saving'
      ? 'Enregistrement...'
      : saveState === 'saved'
        ? lastSavedLabel
          ? `Enregistré ${lastSavedLabel}`
          : 'Enregistré'
        : saveState === 'error'
          ? 'Enregistrement non confirmé'
          : 'Bloc-notes prêt';

  return (
    <main className="screen-shell dashboard-screen notebook-screen">
      <div className="screen-shell__frame">
        <header className="notebook-page-header">
          <button
            className="notebook-page-header__back"
            onClick={backToWelcome}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
            Retour
          </button>
          <h1>Bloc-notes</h1>
          <span aria-hidden="true" />
        </header>

        {legacyNotebookRecovery ? (
          <section
            aria-labelledby="legacy-notebook-recovery-title"
            className="notebook-recovery-card"
          >
            <div className="notebook-recovery-card__heading">
              <span className="notebook-recovery-card__icon" aria-hidden="true">
                <ArchiveRestore />
              </span>
              <div>
                <h2 id="legacy-notebook-recovery-title">
                  Ancienne copie locale détectée
                </h2>
                <p>
                  Elle est différente de la version Supabase et ne sera jamais
                  réimportée sans ton accord.
                </p>
              </div>
            </div>

            <div className="notebook-recovery-card__versions">
              <span>
                Copie locale :{' '}
                <strong>
                  {formatSaveTimestamp(legacyNotebookRecovery.updatedAt) ??
                    'date inconnue'}
                </strong>
              </span>
              <span>
                Supabase :{' '}
                <strong>{lastSavedLabel ?? 'bloc-notes vide'}</strong>
              </span>
            </div>

            <blockquote className="notebook-recovery-card__preview">
              {legacyNotebookPreview}
            </blockquote>

            <div className="notebook-recovery-card__actions">
              <button
                className="notebook-recovery-card__button notebook-recovery-card__button--secondary"
                disabled={legacyRecoveryState !== 'idle' || saveState === 'saving'}
                onClick={keepSupabaseNotebook}
                type="button"
              >
                {legacyRecoveryState === 'keeping-supabase'
                  ? 'Suppression…'
                  : 'Conserver Supabase'}
              </button>
              <button
                className="notebook-recovery-card__button notebook-recovery-card__button--primary"
                disabled={legacyRecoveryState !== 'idle' || saveState === 'saving'}
                onClick={() => void restoreLegacyNotebook()}
                type="button"
              >
                {legacyRecoveryState === 'restoring'
                  ? 'Restauration…'
                  : 'Restaurer la copie locale'}
              </button>
            </div>
          </section>
        ) : null}

        {legacyRecoveryFeedback ? (
          <div
            className={`notebook-recovery-feedback notebook-recovery-feedback--${legacyRecoveryFeedback.kind}`}
            role={legacyRecoveryFeedback.kind === 'error' ? 'alert' : 'status'}
          >
            {legacyRecoveryFeedback.message}
          </div>
        ) : null}

        <div className="notebook-workspace">
          <section className="notebook-editor-card" aria-label="Bloc-notes personnel">
            <div className="notebook-toolbar" aria-label="Barre d’édition">
              <div className="notebook-toolbar__group">
                <button
                  aria-label="Gras"
                  className={`notebook-tool-button ${
                    activeFormats.bold ? 'notebook-tool-button--active' : ''
                  }`}
                  onMouseDown={handleToolbarPointerDown}
                  onClick={() => runCommand('bold')}
                  type="button"
                >
                  <Bold aria-hidden="true" />
                </button>
                <button
                  aria-label="Souligné"
                  className={`notebook-tool-button ${
                    activeFormats.underline ? 'notebook-tool-button--active' : ''
                  }`}
                  onMouseDown={handleToolbarPointerDown}
                  onClick={() => runCommand('underline')}
                  type="button"
                >
                  <Underline aria-hidden="true" />
                </button>
                <button
                  aria-label="Surligner"
                  className={`notebook-tool-button notebook-tool-button--highlight ${
                    activeFormats.highlight ? 'notebook-tool-button--active' : ''
                  }`}
                  onMouseDown={handleToolbarPointerDown}
                  onClick={toggleHighlight}
                  type="button"
                >
                  <Highlighter aria-hidden="true" />
                </button>
                <button
                  aria-label="Liste à puces"
                  className={`notebook-tool-button ${
                    activeFormats.unorderedList ? 'notebook-tool-button--active' : ''
                  }`}
                  onMouseDown={handleToolbarPointerDown}
                  onClick={() => runCommand('insertUnorderedList')}
                  type="button"
                >
                  <List aria-hidden="true" />
                </button>
                <button
                  aria-label="Liste numérotée"
                  className={`notebook-tool-button ${
                    activeFormats.orderedList ? 'notebook-tool-button--active' : ''
                  }`}
                  onMouseDown={handleToolbarPointerDown}
                  onClick={() => runCommand('insertOrderedList')}
                  type="button"
                >
                  <ListOrdered aria-hidden="true" />
                </button>
              </div>

              <div className="notebook-toolbar__actions">
                <button
                  className="notebook-insert-button"
                  onClick={() => setIsInterventionPanelOpen(true)}
                  type="button"
                >
                  <BriefcaseMedical aria-hidden="true" />
                  Note intervention
                </button>
                <button
                  className="notebook-insert-button notebook-insert-button--free"
                  onClick={insertFreeNote}
                  type="button"
                >
                  <NotebookPen aria-hidden="true" />
                  Note libre
                </button>
              </div>
            </div>

            <div
              aria-label="Zone de texte du bloc-notes"
              className="notebook-editor"
              contentEditable
              onBlur={() => persistEditorContent(true)}
              onFocus={syncActiveFormats}
              onInput={() => persistEditorContent()}
              onKeyUp={syncActiveFormats}
              onMouseUp={syncActiveFormats}
              ref={editorRef}
              role="textbox"
              suppressContentEditableWarning
            />

            <footer className="notebook-editor-footer">
              <div className="notebook-editor-footer__meta">
                <span
                  className={`notebook-save-indicator notebook-save-indicator--${saveState}`}
                  role="status"
                >
                  {saveState === 'saving' ? (
                    <LoaderCircle aria-hidden="true" />
                  ) : saveState === 'saved' ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : null}
                  {saveStatusLabel}
                </span>
                {editorAlert ? (
                  <span className="notebook-editor-footer__alert" role="alert">
                    {editorAlert}
                  </span>
                ) : null}
                {saveState === 'error' &&
                latestContentRef.current !== confirmedContentRef.current ? (
                  <button
                    className="notebook-retry-button"
                    onClick={retryNotebookSave}
                    type="button"
                  >
                    Réessayer l’enregistrement
                  </button>
                ) : null}
              </div>
              <button
                className="notebook-clear-button"
                onClick={handleClearNotebook}
                type="button"
              >
                <Trash2 aria-hidden="true" />
                Vider le bloc-notes
              </button>
            </footer>
          </section>

          <aside
            aria-label="Outils complémentaires du bloc-notes"
            className="notebook-desktop-sidebar"
          >
            <section className="notebook-desktop-card notebook-desktop-card--actions">
              <span className="notebook-desktop-card__eyebrow">
                Ajouts rapides
              </span>
              <p>
                Ajoute un repère daté ou reprends les informations d’une
                intervention récente.
              </p>
              <div className="notebook-desktop-actions">
                <button
                  className="notebook-desktop-action"
                  onClick={insertFreeNote}
                  type="button"
                >
                  <span className="notebook-desktop-action__icon notebook-desktop-action__icon--free">
                    <NotebookPen aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Note libre</strong>
                    <small>Insérer la date et commencer à écrire</small>
                  </span>
                </button>
                <button
                  className="notebook-desktop-action"
                  onClick={() => setIsInterventionPanelOpen(true)}
                  type="button"
                >
                  <span className="notebook-desktop-action__icon">
                    <BriefcaseMedical aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Note intervention</strong>
                    <small>Choisir parmi les dernières interventions</small>
                  </span>
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {isInterventionPanelOpen ? (
        <div className="notebook-panel" role="dialog" aria-modal="true">
          <div className="notebook-panel__sheet">
            <header className="notebook-panel__header">
              <div>
                <span>Note intervention</span>
                <h2>Dernières interventions</h2>
              </div>
              <button
                aria-label="Fermer"
                className="notebook-panel__close"
                onClick={() => setIsInterventionPanelOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            {latestInterventions.length ? (
              <div className="notebook-panel__list">
                {latestInterventions.map((intervention) => (
                  <button
                    className="notebook-panel__item"
                    key={intervention.id}
                    onClick={() => insertInterventionNote(intervention)}
                    type="button"
                  >
                    <span>{formatLongDate(intervention.date)}</span>
                    <strong>
                      {getChoiceLabel(surgicalProcedureOptions, intervention.procedure)}
                    </strong>
                    <small>
                      Voie :{' '}
                      {getChoiceLabel(
                        approachOptions,
                        intervention.approach,
                        'Non renseignée'
                      )}{' '}
                      · Enregistrée à {formatShortTime(intervention.savedAt)}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="notebook-panel__empty">
                Aucune intervention enregistrée pour le moment.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
