Hanoi Workshop - SWI-Prolog + JavaScript
Files: index.html, style.css, script.js, hanoi.pl, server.pl

WITH PROLOG (the real thing)
  1. Install SWI-Prolog from https://www.swi-prolog.org
  2. In this folder run:   swipl server.pl
  3. Open http://localhost:8080  (the badge on the page says "SWI-Prolog server")
  Stop the server with:    ?- halt.

PROLOG IN THE TERMINAL ONLY
  swipl hanoi.pl     then     ?- solve(3).

NO PROLOG? (GitHub Pages, double-clicking index.html)
  The page still works: JavaScript runs the same algorithm as a fallback.
