% server.pl - serves the site AND the /api/solve endpoint, all in SWI-Prolog.
% Run:  swipl server.pl     then open  http://localhost:8080
:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_files)).
:- use_module(library(http/http_json)).
:- use_module(library(http/http_parameters)).
:- use_module(hanoi).

:- dynamic web_root/1.
:- prolog_load_context(directory, Dir), asserta(web_root(Dir)).

:- http_handler(root(api/solve), solve_handler, []).
:- http_handler(root(.), serve_static, [prefix]).

serve_static(Request) :-
    web_root(Dir),
    http_reply_from_files(Dir, [], Request).

% GET /api/solve?n=4  ->  {"engine":"swi-prolog","n":4,"count":15,"moves":[...]}
solve_handler(Request) :-
    http_parameters(Request, [n(N, [between(1, 10), default(3)])]),
    once(hanoi(N, left, right, center, Moves)),
    length(Moves, Count),
    maplist(move_dict, Moves, Dicts),
    reply_json_dict(_{engine: "swi-prolog", n: N, count: Count, moves: Dicts}).

move_dict(move(D, F, T), _{disk: D, from: F, to: T}).

server(Port) :-
    http_server(http_dispatch, [port(Port)]),
    format("Hanoi server running: http://localhost:~w/~n", [Port]).

:- initialization(server(8080)).
