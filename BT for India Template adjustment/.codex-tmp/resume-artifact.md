# Resume template execution contract

- Reference: `/Users/lijiajun/Documents/GitHub/python-document/BT for India Template adjustment/Resume.docx`
- SHA-256: `7bbde46cfda0aa0ef05b5a0cd226923f75ca60b960f7a34d46537a3a24eb52cf`
- Render: `.codex-tmp/resume-template-render/page-1.png`; one A4 portrait page; one section.
- Page system: A4 portrait, margins L/R 1.25 in, T/B 1.00 in; no distinct first-page header/footer.
- Visual authority: preserve the black Personal Resume banner, horizontal section rules, icons, photo frame, and the four Education/Honors/Experience/Skills sections.
- Typography: retain all source run/paragraph properties and shape positions. Do not apply a new style system.
- Structure: the visible document is composed of anchored DrawingML/VML text boxes and images inside `word/document.xml`; alternate Choice/Fallback representations repeat visible text and both must be updated consistently.
- Editable slots: `NAME`, `ADDRESS`, `BIRTH DATE`, `Phone :`, `E-mail :`, education period/institution/degree line, education note line, honors line, experience line, experience description, and the two skills bullets.
- Photo slot: preserve the empty photo frame and do not insert an image in this iteration.
- Slot capacity: name/contact lines must remain single line where practical; education and work content may use explicit line breaks but must not overlap the following section.
- Preserve-only package parts: styles, settings, theme, numbering, media, relationships, document background, shape geometry, headers/footers, and all opaque drawing metadata.
- Fidelity gates: retained reference remains byte-for-byte unchanged; final remains one A4 page; banner, icons, photo frame, section headings and rules remain aligned; no text clipping or overlap.
