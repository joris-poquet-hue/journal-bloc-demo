import {
  ArchiveRestore,
  Bold,
  BriefcaseMedical,
  CheckCircle2,
  ChevronLeft,
  Highlighter,
  History,
  List,
  ListOrdered,
  LoaderCircle,
  NotebookPen,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent,
} from 'react';

import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  formatDisplayName,
  getChoiceLabel,
} from '../data/mockData';
import {
  loadBackendNotebookVersions,
  restoreBackendNotebookVersion,
} from '../services/backendRepository';
import type {
  NotebookDocument,
  NotebookDocumentVersion,
  SavedIntervention,
  Senior,
} from '../types';
import {
  readLegacyNotebookRecovery,
  resolveLegacyNotebookRecovery,
} from '../utils/legacyNotebookRecovery';
import { sanitizeNotebookHtml } from '../utils/notebookHtml';

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
    refreshBackendData,
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
  const editorDocumentVersionRef = useRef(0);
  const remoteConflictRef = useRef<NotebookDocument | null>(null);
  const isMountedRef = useRef(true);
  const updateNotebookDocumentRef = useRef(updateNotebookDocument);
  updateNotebookDocumentRef.current = updateNotebookDocument;
  const [isInterventionPanelOpen, setIsInterventionPanelOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<NotebookDocumentVersion[]>([]);
  const [historyState, setHistoryState] = useState<'error' | 'idle' | 'loading'>('idle');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [editorAlert, setEditorAlert] = useState<string | null>(null);
  const [remoteConflict, setRemoteConflict] =
    useState<NotebookDocument | null>(null);
  const [legacyNotebookRecovery, setLegacyNotebookRecovery] =
    useState<NotebookDocument | null>(null);
  const [legacyRecoveryState, setLegacyRecoveryState] = useState<
    'idle' | 'keeping-server' | 'restoring'
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

    const remoteContent = sanitizeNotebookHtml(
      notebookDocument?.contentHtml ?? ''
    );
    const remoteVersion = notebookDocument?.version ?? 0;
    const localContent = sanitizeNotebookHtml(editor.innerHTML);
    const remoteDocumentChanged =
      remoteVersion !== editorDocumentVersionRef.current ||
      remoteContent !== confirmedContentRef.current;

    if (!remoteDocumentChanged) {
      return;
    }

    if (
      activeSaveCountRef.current > 0 &&
      requestedContentRef.current === remoteContent
    ) {
      confirmedContentRef.current = remoteContent;
      editorDocumentVersionRef.current = remoteVersion;
      return;
    }

    const hasLocalChanges =
      localContent !== confirmedContentRef.current ||
      latestContentRef.current !== confirmedContentRef.current ||
      saveTimerRef.current !== null ||
      activeSaveCountRef.current > 0;

    if (hasLocalChanges && localContent !== remoteContent) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      saveAttemptRef.current += 1;
      const conflictDocument: NotebookDocument = {
        ...(notebookDocument ?? {
          internalId: selectedInternal.id,
          updatedAt: new Date().toISOString(),
          version: remoteVersion,
        }),
        contentHtml: remoteContent,
      };
      remoteConflictRef.current = conflictDocument;
      setRemoteConflict(conflictDocument);
      setSaveState('error');
      setEditorAlert(
        'Une version plus récente existe sur un autre appareil. Choisis la version à conserver avant de continuer.'
      );
      return;
    }

    editor.innerHTML = remoteContent;
    confirmedContentRef.current = remoteContent;
    latestContentRef.current = remoteContent;
    requestedContentRef.current = remoteContent;
    editorDocumentVersionRef.current = remoteVersion;
    remoteConflictRef.current = null;
    setRemoteConflict(null);
    saveAttemptRef.current += 1;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveState(notebookDocument?.updatedAt ? 'saved' : 'idle');
    setEditorAlert(null);
  }, [notebookDocument, selectedInternal]);

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
  }, [notebookDocument?.contentHtml, selectedInternal]);

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
        !remoteConflictRef.current &&
        pendingContent !== confirmedContentRef.current &&
        pendingContent !== requestedContentRef.current
      ) {
        void updateNotebookDocumentRef
          .current(pendingContent, editorDocumentVersionRef.current)
          .catch(() => undefined);
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

  const refreshNotebookHistory = async () => {
    setHistoryState('loading');

    try {
      setHistoryVersions(
        await loadBackendNotebookVersions(selectedInternal.id)
      );
      setHistoryState('idle');
    } catch {
      setHistoryState('error');
    }
  };

  const openNotebookHistory = () => {
    setIsHistoryPanelOpen(true);
    void refreshNotebookHistory();
  };

  const persistNotebookContent = async (
    contentHtml: string,
    attemptId: number,
    saveDocument: () => Promise<NotebookDocument> = () =>
      updateNotebookDocument(contentHtml, editorDocumentVersionRef.current)
  ) => {
    requestedContentRef.current = contentHtml;
    activeSaveCountRef.current += 1;
    let saveSucceeded = false;

    try {
      const confirmedDocument = await saveDocument();
      const confirmedContent = sanitizeNotebookHtml(
        confirmedDocument.contentHtml
      );
      confirmedContentRef.current = confirmedContent;
      editorDocumentVersionRef.current = confirmedDocument.version ?? 0;
      saveSucceeded = true;

      if (!isMountedRef.current || attemptId !== saveAttemptRef.current) {
        return true;
      }

      const currentEditorContent = sanitizeNotebookHtml(
        editorRef.current?.innerHTML ?? ''
      );
      if (currentEditorContent === confirmedContent) {
        setSaveState('saved');
        setEditorAlert(null);
        if (isHistoryPanelOpen) {
          void refreshNotebookHistory();
        }
      } else {
        setSaveState('saving');
      }

      return true;
    } catch (error) {
      if (!isMountedRef.current || remoteConflictRef.current) {
        return false;
      }

      const isVersionConflict =
        error instanceof Error && error.message.includes('version plus récente');

      setSaveState('error');
      setEditorAlert(
        isVersionConflict
          ? 'Une version plus récente du bloc-notes existe sur le serveur. Son contenu va être proposé dès la prochaine synchronisation.'
          : 'Le bloc-notes n’a pas été enregistré sur le serveur. Le contenu reste affiché sur cette page : vérifie la connexion puis réessaie.'
      );

      if (isVersionConflict) {
        void refreshBackendData().catch(() => undefined);
      }

      return false;
    } finally {
      activeSaveCountRef.current = Math.max(0, activeSaveCountRef.current - 1);

      if (
        saveSucceeded &&
        isMountedRef.current &&
        activeSaveCountRef.current === 0 &&
        !remoteConflictRef.current &&
        latestContentRef.current !== confirmedContentRef.current
      ) {
        window.setTimeout(() => persistEditorContent(), 0);
      }
    }
  };

  const persistEditorContent = (immediate = false) => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const contentHtml = sanitizeNotebookHtml(editor.innerHTML);

    if (editor.innerHTML !== contentHtml) {
      editor.innerHTML = contentHtml;
    }

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

    if (remoteConflictRef.current) {
      setSaveState('error');
      setEditorAlert(
        'Résous d’abord le conflit avec la version enregistrée sur l’autre appareil.'
      );
      return;
    }

    setSaveState('saving');
    setEditorAlert(null);

    if (activeSaveCountRef.current > 0) {
      return;
    }

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

  const insertTransferredContent = (html: string, plainText: string) => {
    const sanitizedHtml = html ? sanitizeNotebookHtml(html) : '';
    const safeContent =
      sanitizedHtml || escapeHtml(plainText).replace(/\r\n?|\n/g, '<br>');

    if (safeContent) {
      insertHtml(safeContent);
    }
  };

  const handleEditorPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    insertTransferredContent(
      event.clipboardData.getData('text/html'),
      event.clipboardData.getData('text/plain')
    );
  };

  const handleEditorDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    insertTransferredContent(
      event.dataTransfer.getData('text/html'),
      event.dataTransfer.getData('text/plain')
    );
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
    void persistNotebookContent('', attemptId, () =>
      clearNotebookDocument(editorDocumentVersionRef.current)
    );
  };

  const retryNotebookSave = () => {
    persistEditorContent(true);
  };

  const keepServerNotebook = () => {
    if (!legacyNotebookRecovery || legacyRecoveryState !== 'idle') {
      return;
    }

    setLegacyRecoveryState('keeping-server');
    setLegacyRecoveryFeedback(null);

    try {
      resolveLegacyNotebookRecovery(selectedInternal.id);
      setLegacyNotebookRecovery(null);
      setLegacyRecoveryFeedback({
        kind: 'success',
        message:
          'La version enregistrée sur le serveur est conservée. L’ancienne copie locale de ce bloc-notes a été supprimée.',
      });
    } catch {
      setLegacyRecoveryFeedback({
        kind: 'error',
        message:
          'La version enregistrée sur le serveur reste inchangée, mais l’ancienne copie locale n’a pas pu être supprimée.',
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
        'Restaurer cette ancienne copie locale ? Le contenu actuel du bloc-notes enregistré sur le serveur sera remplacé uniquement après confirmation.'
      )
    ) {
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const sanitizedLegacyContent = sanitizeNotebookHtml(
      legacyDocument.contentHtml
    );

    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizedLegacyContent;
    }

    latestContentRef.current = sanitizedLegacyContent;
    const attemptId = saveAttemptRef.current + 1;
    saveAttemptRef.current = attemptId;
    setLegacyRecoveryState('restoring');
    setLegacyRecoveryFeedback(null);
    setSaveState('saving');
    setEditorAlert(null);

    const wasRestored = await persistNotebookContent(
      sanitizedLegacyContent,
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
          'L’ancienne copie locale a été restaurée sur le serveur puis supprimée de cet appareil.',
      });
    } catch {
      setLegacyRecoveryFeedback({
        kind: 'error',
        message:
          'La restauration sur le serveur a réussi, mais l’ancienne copie locale n’a pas pu être supprimée de cet appareil.',
      });
    } finally {
      setLegacyNotebookRecovery(null);
      setLegacyRecoveryState('idle');
    }
  };

  const loadRemoteConflictVersion = () => {
    const conflict = remoteConflictRef.current;
    const editor = editorRef.current;

    if (!conflict || !editor) {
      return;
    }

    const remoteContent = sanitizeNotebookHtml(conflict.contentHtml);
    editor.innerHTML = remoteContent;
    confirmedContentRef.current = remoteContent;
    latestContentRef.current = remoteContent;
    requestedContentRef.current = remoteContent;
    editorDocumentVersionRef.current = conflict.version ?? 0;
    remoteConflictRef.current = null;
    setRemoteConflict(null);
    saveAttemptRef.current += 1;
    setSaveState(conflict.updatedAt ? 'saved' : 'idle');
    setEditorAlert(null);
  };

  const keepLocalConflictVersion = () => {
    const conflict = remoteConflictRef.current;
    const editor = editorRef.current;

    if (!conflict || !editor) {
      return;
    }

    if (activeSaveCountRef.current > 0) {
      setEditorAlert(
        'La sauvegarde précédente se termine. Réessaie dans un instant.'
      );
      return;
    }

    const localContent = sanitizeNotebookHtml(editor.innerHTML);
    const expectedVersion = conflict.version ?? 0;
    confirmedContentRef.current = sanitizeNotebookHtml(conflict.contentHtml);
    latestContentRef.current = localContent;
    editorDocumentVersionRef.current = expectedVersion;
    remoteConflictRef.current = null;
    setRemoteConflict(null);
    const attemptId = saveAttemptRef.current + 1;
    saveAttemptRef.current = attemptId;
    setSaveState('saving');
    setEditorAlert(null);
    void persistNotebookContent(localContent, attemptId, () =>
      updateNotebookDocument(localContent, expectedVersion)
    );
  };

  const mergeConflictVersions = () => {
    const conflict = remoteConflictRef.current;
    const editor = editorRef.current;

    if (!conflict || !editor || activeSaveCountRef.current > 0) {
      return;
    }

    const localContent = sanitizeNotebookHtml(editor.innerHTML);
    const remoteContent = sanitizeNotebookHtml(conflict.contentHtml);
    const mergedContent = sanitizeNotebookHtml(
      `${localContent}<hr class="notebook-separator"><section class="notebook-entry"><p class="notebook-entry__date">Version reçue de l’autre appareil</p>${remoteContent}</section>`
    );
    const expectedVersion = conflict.version ?? 0;

    editor.innerHTML = mergedContent;
    confirmedContentRef.current = remoteContent;
    latestContentRef.current = mergedContent;
    editorDocumentVersionRef.current = expectedVersion;
    remoteConflictRef.current = null;
    setRemoteConflict(null);
    const attemptId = saveAttemptRef.current + 1;
    saveAttemptRef.current = attemptId;
    setSaveState('saving');
    setEditorAlert(null);
    void persistNotebookContent(mergedContent, attemptId, () =>
      updateNotebookDocument(mergedContent, expectedVersion)
    );
  };

  const restoreHistoryVersion = async (version: NotebookDocumentVersion) => {
    const editor = editorRef.current;

    if (
      !editor ||
      saveState === 'saving' ||
      !window.confirm(
        `Restaurer la version du ${formatSaveTimestamp(version.sourceUpdatedAt) ?? 'jour indiqué'} ? La version actuelle restera accessible dans l’historique.`
      )
    ) {
      return;
    }

    const restoredContent = sanitizeNotebookHtml(version.contentHtml);
    const expectedVersion = notebookDocument?.version ?? editorDocumentVersionRef.current;
    editor.innerHTML = restoredContent;
    latestContentRef.current = restoredContent;
    remoteConflictRef.current = null;
    setRemoteConflict(null);
    const attemptId = saveAttemptRef.current + 1;
    saveAttemptRef.current = attemptId;
    setSaveState('saving');
    setEditorAlert(null);
    const wasRestored = await persistNotebookContent(
      restoredContent,
      attemptId,
      () => restoreBackendNotebookVersion(version.id, expectedVersion)
    );

    if (wasRestored) {
      await refreshBackendData().catch(() => undefined);
      setIsHistoryPanelOpen(false);
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
                  Elle est différente de la version serveur et ne sera jamais
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
                Version serveur :{' '}
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
                onClick={keepServerNotebook}
                type="button"
              >
                {legacyRecoveryState === 'keeping-server'
                  ? 'Suppression…'
                  : 'Conserver la version serveur'}
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

        {remoteConflict ? (
          <section
            aria-labelledby="notebook-conflict-title"
            className="notebook-recovery-card"
          >
            <div className="notebook-recovery-card__heading">
              <span className="notebook-recovery-card__icon" aria-hidden="true">
                <ArchiveRestore />
              </span>
              <div>
                <h2 id="notebook-conflict-title">
                  Modification détectée sur un autre appareil
                </h2>
                <p>
                  La sauvegarde automatique est suspendue pour ne remplacer
                  aucune version sans ton accord.
                </p>
              </div>
            </div>
            <div className="notebook-conflict-comparison">
              <article>
                <strong>Ma saisie sur cet appareil</strong>
                <p>{getNotebookTextPreview(editorRef.current?.innerHTML ?? '')}</p>
              </article>
              <article>
                <strong>Version enregistrée à distance</strong>
                <p>{getNotebookTextPreview(remoteConflict.contentHtml)}</p>
              </article>
            </div>
            <div className="notebook-recovery-card__actions">
              <button
                className="notebook-recovery-card__button notebook-recovery-card__button--secondary"
                onClick={loadRemoteConflictVersion}
                type="button"
              >
                Charger la version serveur
              </button>
              <button
                className="notebook-recovery-card__button notebook-recovery-card__button--secondary"
                onClick={mergeConflictVersions}
                type="button"
              >
                Fusionner les deux versions
              </button>
              <button
                className="notebook-recovery-card__button notebook-recovery-card__button--primary"
                onClick={keepLocalConflictVersion}
                type="button"
              >
                Conserver ma version
              </button>
            </div>
          </section>
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
                  onClick={openNotebookHistory}
                  type="button"
                >
                  <History aria-hidden="true" />
                  Historique
                </button>
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
              data-testid="notebook-editor"
              onBlur={() => persistEditorContent(true)}
              onDrop={handleEditorDrop}
              onFocus={syncActiveFormats}
              onInput={() => persistEditorContent()}
              onKeyUp={syncActiveFormats}
              onMouseUp={syncActiveFormats}
              onPaste={handleEditorPaste}
              ref={editorRef}
              role="textbox"
              suppressContentEditableWarning
            />

            <footer className="notebook-editor-footer">
              <div className="notebook-editor-footer__meta">
                <span
                  className={`notebook-save-indicator notebook-save-indicator--${saveState}`}
                  data-testid="notebook-save-status"
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

      {isHistoryPanelOpen ? (
        <div className="notebook-panel" role="dialog" aria-modal="true" aria-labelledby="notebook-history-title">
          <div className="notebook-panel__sheet notebook-history-sheet">
            <header className="notebook-panel__header">
              <div>
                <span>Récupération</span>
                <h2 id="notebook-history-title">Historique du bloc-notes</h2>
              </div>
              <button
                aria-label="Fermer"
                className="notebook-panel__close"
                onClick={() => setIsHistoryPanelOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <p className="notebook-history-current">
              Version actuelle : <strong>{lastSavedLabel ?? 'bloc-notes vide'}</strong>
            </p>

            {historyState === 'loading' ? (
              <p className="notebook-panel__empty" role="status">
                <LoaderCircle aria-hidden="true" /> Chargement de l’historique…
              </p>
            ) : historyState === 'error' ? (
              <div className="notebook-history-error" role="alert">
                <p>L’historique ne peut pas être chargé pour le moment.</p>
                <button className="notebook-retry-button" onClick={() => void refreshNotebookHistory()} type="button">
                  Réessayer
                </button>
              </div>
            ) : historyVersions.length ? (
              <div className="notebook-history-list">
                {historyVersions.map((version) => (
                  <article className="notebook-history-item" key={version.id}>
                    <div>
                      <strong>
                        {formatSaveTimestamp(version.sourceUpdatedAt) ?? 'Date inconnue'}
                      </strong>
                      <small>Version {version.sourceVersion}</small>
                    </div>
                    <p>{getNotebookTextPreview(version.contentHtml)}</p>
                    <button
                      className="notebook-recovery-card__button notebook-recovery-card__button--secondary"
                      disabled={saveState === 'saving'}
                      onClick={() => void restoreHistoryVersion(version)}
                      type="button"
                    >
                      Restaurer cette version
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="notebook-panel__empty">
                Aucune version antérieure n’est encore disponible.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
