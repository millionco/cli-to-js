const HELP_SIGNAL_PATTERNS = [/usage:/i, /options:/i, /commands:/i, /^\s+-/m];

const countHelpSignals = (text: string): number =>
  HELP_SIGNAL_PATTERNS.filter((pattern) => pattern.test(text)).length;

export const selectHelpOutput = (stdout: string, stderr: string): string => {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();

  if (!trimmedStdout && !trimmedStderr) return "";
  if (!trimmedStderr) return stdout;
  if (!trimmedStdout) return stderr;

  const stdoutSignals = countHelpSignals(trimmedStdout);
  const stderrSignals = countHelpSignals(trimmedStderr);

  if (stdoutSignals > 0 && stderrSignals === 0) return stdout;
  if (stderrSignals > 0 && stdoutSignals === 0) return stderr;
  if (stdoutSignals > 0 && stderrSignals > 0) {
    return stdoutSignals >= stderrSignals ? stdout : stderr;
  }

  return trimmedStdout.length >= trimmedStderr.length ? stdout : stderr;
};
