@echo off
COLOR 0C
title Eternity-World: Npc xml Search
cls
echo.
echo.Thank you for using our services - Eternity-World Team
echo.http://eternity-world.ru
echo.
:find
set /p text="Enter text search: "
echo.
echo.search text "%text%" result:
findstr /I /N %text% *.xml
echo.
goto find