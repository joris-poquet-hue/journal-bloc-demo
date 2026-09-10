const ALLOWED_NOTEBOOK_TAGS = new Set([
  'B',
  'BR',
  'DIV',
  'HR',
  'LI',
  'MARK',
  'OL',
  'P',
  'SECTION',
  'SPAN',
  'STRONG',
  'U',
  'UL',
]);

const NOTEBOOK_CLASSES = new Set([
  'notebook-entry',
  'notebook-entry__date',
  'notebook-entry__muted',
  'notebook-separator',
]);

const CONTENT_REMOVAL_TAGS = new Set([
  'AUDIO',
  'BASE',
  'EMBED',
  'FORM',
  'IFRAME',
  'IMG',
  'INPUT',
  'LINK',
  'MATH',
  'META',
  'OBJECT',
  'PICTURE',
  'SCRIPT',
  'SOURCE',
  'STYLE',
  'SVG',
  'TEMPLATE',
  'VIDEO',
]);

function sanitizeNotebookStyle(element: HTMLElement) {
  const backgroundColor = element.style.backgroundColor
    .replace(/\s+/g, '')
    .toLowerCase();
  const fontWeight = element.style.fontWeight.toLowerCase();
  const textDecoration = (
    element.style.textDecorationLine || element.style.textDecoration
  ).toLowerCase();
  const safeDeclarations: string[] = [];

  if (
    backgroundColor === '#fff0c8' ||
    backgroundColor === 'rgb(255,240,200)' ||
    backgroundColor === 'transparent'
  ) {
    safeDeclarations.push(`background-color: ${backgroundColor}`);
  }

  if (fontWeight === 'bold' || fontWeight === '700') {
    safeDeclarations.push('font-weight: bold');
  }

  if (textDecoration.split(/\s+/).includes('underline')) {
    safeDeclarations.push('text-decoration: underline');
  }

  if (safeDeclarations.length > 0) {
    element.setAttribute('style', safeDeclarations.join('; '));
  } else {
    element.removeAttribute('style');
  }
}

export function sanitizeNotebookHtml(contentHtml: string) {
  if (!contentHtml) {
    return '';
  }

  if (typeof document === 'undefined') {
    throw new Error(
      'Le nettoyage HTML du bloc-notes nécessite un environnement navigateur.'
    );
  }

  const template = document.createElement('template');
  template.innerHTML = contentHtml;

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    if (CONTENT_REMOVAL_TAGS.has(element.tagName)) {
      element.remove();
      continue;
    }

    if (!ALLOWED_NOTEBOOK_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const safeClasses = Array.from(element.classList).filter((className) =>
      NOTEBOOK_CLASSES.has(className)
    );

    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name !== 'class' && attribute.name !== 'style') {
        element.removeAttribute(attribute.name);
      }
    }

    if (safeClasses.length > 0) {
      element.className = safeClasses.join(' ');
    } else {
      element.removeAttribute('class');
    }

    sanitizeNotebookStyle(element as HTMLElement);
  }

  return template.innerHTML;
}
