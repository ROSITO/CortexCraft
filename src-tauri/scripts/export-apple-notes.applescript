-- Usage: osascript export-apple-notes.applescript /tmp/out.jsonl [maxNotes]
on run argv
  set outPath to item 1 of argv
  set maxNotes to 5000
  if (count of argv) ≥ 2 then set maxNotes to (item 2 of argv) as integer
  set posixOut to outPath
  do shell script "rm -f " & quoted form of posixOut & " ; touch " & quoted form of posixOut

  tell application "Notes"
    launch
    set exported to 0
    repeat with f in folders
      set fname to my esc(name of f)
      repeat with n in notes of f
        if exported ≥ maxNotes then exit repeat
        try
          set t to my esc(name of n)
          set mid to my esc(id of n as string)
          set mdate to my esc((modification date of n) as string)
          set b to my esc(body of n as string)
          set lineTxt to "{\"folder\":\"" & fname & "\",\"title\":\"" & t & "\",\"id\":\"" & mid & "\",\"modified\":\"" & mdate & "\",\"body\":\"" & b & "\"}"
          do shell script "printf '%s\\n' " & quoted form of lineTxt & " >> " & quoted form of posixOut
          set exported to exported + 1
        end try
      end repeat
      if exported ≥ maxNotes then exit repeat
    end repeat
  end tell
  return exported as string
end run

on esc(s)
  set s to my replaceText(s, "\\", "\\\\")
  set s to my replaceText(s, "\"", "\\\"")
  set s to my replaceText(s, return, "\\n")
  set s to my replaceText(s, linefeed, "\\n")
  set s to my replaceText(s, tab, "\\t")
  return s
end esc

on replaceText(theText, old, new)
  set AppleScript's text item delimiters to old
  set theItems to every text item of theText
  set AppleScript's text item delimiters to new
  set theText to theItems as string
  set AppleScript's text item delimiters to ""
  return theText
end replaceText
