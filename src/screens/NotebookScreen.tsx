import {
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
import { SavedIntervention, Senior } from '../types';

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

function normalizeCommandColor(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
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
  const pendingSaveRef = useRef(false);
  const [isInterventionPanelOpen, setIsInterventionPanelOpen] = useState(false);
  const [characterCount, setCharacterCount] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [editorAlert, setEditorAlert] = useState<string | null>(null);
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

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || !selectedInternal) {
      return;
    }

    editor.innerHTML = notebookDocument?.contentHtml ?? '';
    setCharacterCount(editor.innerText.trim().length);
    setSaveState(notebookDocument?.updatedAt ? 'saved' : 'idle');
    setEditorAlert(null);
    pendingSaveRef.current = false;
  }, [selectedInternal?.id]);

  useEffect(() => {
    if (!pendingSaveRef.current) {
      return;
    }

    pendingSaveRef.current = false;
    setSaveState('saved');
    setEditorAlert(null);
  }, [notebookDocument?.updatedAt]);

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

  const persistEditorContent = () => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    setCharacterCount(editor.innerText.trim().length);

    if (editor.innerHTML === (notebookDocument?.contentHtml ?? '')) {
      return;
    }

    pendingSaveRef.current = true;
    setSaveState('saving');
    setEditorAlert(null);
    updateNotebookDocument(editor.innerHTML);
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

  const insertHtml = (html: string) => {
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

    persistEditorContent();
  };

  const insertFreeNote = () => {
    const now = new Date();

    insertHtml(`
      <section class="notebook-entry">
        <p class="notebook-entry__date">${escapeHtml(formatLongDate(now.toISOString().slice(0, 10)))} – ${escapeHtml(formatShortTime(now))}</p>
        <p><br></p>
      </section>
      <hr class="notebook-separator">
      <p><br></p>
    `);
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

    insertHtml(`
      <section class="notebook-entry">
        <p>${escapeHtml(formatLongDate(intervention.date))} – <strong>${escapeHtml(procedureLabel)}</strong></p>
        <p>Voie d’abord : <strong>${escapeHtml(approachLabel)}</strong></p>
        <p>Senior : <strong>${escapeHtml(formatNotebookSenior(senior))}</strong></p>
        <p class="notebook-entry__muted">Note ajoutée à ${escapeHtml(formatShortTime(now))}</p>
        <p><br></p>
      </section>
      <hr class="notebook-separator">
      <p><br></p>
    `);
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

    pendingSaveRef.current = true;
    setSaveState('saving');
    setEditorAlert(null);
    clearNotebookDocument();
    setCharacterCount(0);
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
          ? 'Action non prise en charge'
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
            onFocus={syncActiveFormats}
            onInput={persistEditorContent}
            onKeyUp={syncActiveFormats}
            onMouseUp={syncActiveFormats}
            ref={editorRef}
            role="textbox"
            suppressContentEditableWarning
          />

          <footer className="notebook-editor-footer">
            <div className="notebook-editor-footer__meta">
              <span>{characterCount} caractères</span>
              <span
                className={`notebook-save-indicator notebook-save-indicator--${saveState}`}
              >
                {saveState === 'saving' ? (
                  <LoaderCircle aria-hidden="true" />
                ) : saveState === 'saved' ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : null}
                {saveStatusLabel}
              </span>
              {editorAlert ? (
                <span className="notebook-save-indicator notebook-save-indicator--error">
                  {editorAlert}
                </span>
              ) : null}
            </div>
            <button
              className="notebook-clear-button"
              onClick={handleClearNotebook}
              type="button"
            >
              <Trash2 aria-hidden="true" />
              Vider le bloc note
            </button>
          </footer>
        </section>
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
