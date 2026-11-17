% hanoi.pl - Towers of Hanoi logic in pure SWI-Prolog.
% Terminal use:   swipl hanoi.pl      then      ?- solve(3).
:- module(hanoi, [hanoi/5, solve/1, solve/0]).
:- use_module(library(lists)).

%! hanoi(+N, +From, +To, +Via, -Moves)
%  Moves is the list of move(Disk, From, To) terms that shifts N disks.
hanoi(0, _, _, _, []).
hanoi(N, From, To, Via, Moves) :-
    N > 0,
    M is N - 1,
    hanoi(M, From, Via, To, Before),
    hanoi(M, Via, To, From, After),
    append(Before, [move(N, From, To)|After], Moves).

solve(N) :-
    hanoi(N, left, right, center, Moves),
    forall(member(move(D, F, T), Moves),
           format("Move disk ~w from ~w to ~w~n", [D, F, T])),
    length(Moves, Count),
    format("true. % Solved in ~d moves!~n", [Count]).

solve :- solve(3).
