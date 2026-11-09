// Afterclass UI icons; chat emoji artwork is supplied by Twemoji (see public/emoji/credits.html).
const paths = {
 shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Z',
 smile:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M8 14q4 5 8 0 M8 8v1 M16 8v1',
 reply:'M9 5 3 11l6 6 M3 11h11a7 7 0 0 1 7 7',
 flag:'M5 22V3q4-2 7 0t7 0v10q-4 2-7 0t-7 0',
 lock:'M5 10h14v11H5Z M8 10V6a4 4 0 0 1 8 0v4',
 devices:'M3 4h15v12H3Z M7 20h6 M10 16v4 M17 10h5v11h-5Z',
 info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v6 M12 7v.1',
 inbox:'M3 14 6 4h12l3 10v6H3Z M3 14h5l2 3h4l2-3h5',

 pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
 people:'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M3 21v-3a7 7 0 0 1 14 0v3 M18 4a4 4 0 0 1 0 8 M20 15q3 1 3 6',
 bookmark:'M6 3h12v18l-6-4-6 4Z',
 repeat:'M20 7A9 9 0 0 0 4 7 M20 3v5h-5 M4 17a9 9 0 0 0 16 0 M4 21v-5h5',
 check:'M5 12l4 4L19 6',
 chat:'M21 11a9 8 0 0 1-9 8H7l-5 3 2-6a8 8 0 0 1-1-5 9 8 0 0 1 18 0Z M8 11h8',

 coffee:'M5 9h12v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z M17 10h2a3 3 0 0 1 0 6h-2 M8 3v3 M13 3v3',
 study:'M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 1-4-3-9-1Z M12 6v15',
 move:'M4 5h5l2 6 9 4q2 1 1 5H3V9Z M3 17h18 M11 11l-2 2 M14 12l-2 2',
 play:'M8 7h8c4 0 6 10 4 12-2 2-4-3-6-3h-4c-2 0-4 5-6 3C2 17 4 7 8 7Z M8 10v5 M5.5 12.5h5 M16 11h.1 M18 14h.1',
 all:'M4 4h6v6H4Z M14 4h6v6h-6Z M4 14h6v6H4Z M14 14h6v6h-6Z',
 food:'M5 3v6q0 3 3 3V3 M5 6h3 M6.5 12v9 M17 3q-4 5-2 10h3V3 M18 13v8',
 leaf:'M5 20C0 7 14 3 21 3c0 12-5 19-16 17Z M5 20 16 9',
 laptop:'M5 4h14v12H5Z M2 20l3-4h14l3 4Z',
 ball:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3v18 M6 5q9 7 0 14 M18 5q-9 7 0 14',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
 moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
 calendar:'M4 5h16v16H4Z M8 3v4 M16 3v4 M4 10h16',
 heart:'M12 21 3 12C-3 4 8 0 12 7c4-7 15-3 9 5Z',
 fire:'M12 2c1 7 8 8 8 14a8 8 0 0 1-16 0c0-4 3-7 5-9v7c4-2 4-6 3-12Z',
 thumb:'M8 21H3V10h5 M8 11l5-9q4 0 2 8h5q2 0 1 4l-2 7H8Z',
 eyes:'M10 12a4 7 0 1 1-8 0 4 7 0 0 1 8 0 M22 12a4 7 0 1 1-8 0 4 7 0 0 1 8 0 M7 12v2 M19 12v2',
 snow:'M12 2v20 M3 7l18 10 M3 17 21 7 M8 4l4 3 4-3 M8 20l4-3 4 3',
 hundred:'M3 17h18 M5 7v6 M10 7h3v6h-3Z M17 7h3v6h-3Z M3 21h18'
};
export function uiIcon(name) { return `<svg class="ac-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"> <path d="${paths[name] || paths.all}"/></svg>`; }
export { EXPRESSIONS, expressionArt, renderExpressions } from './emoji-catalog.mjs';
