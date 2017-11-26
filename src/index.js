import os from 'os';
import path from 'path';
import del from 'del';
import execa from 'execa';
import uuidv4 from 'uuid/v4';
import copy from './copy';

/**
 * Keeps in sync a folder and their files with a folder of a git repository
 * @param {(string|string[])} source - Glob or array of globs to read.
 * @param {string} destination - Relative destination path.
 * @param {string} remote - git repository url.
 * @param {Object} [options]
 * @param {string} [options.commitMessage] - Commit message for the modifications.
 * @param {string} [options.branch] - Branch to add and push the changes.
 * @returns {Promise}
 */
export default async function sendToGit(source, destination, remote, options = {}) {
  if (!source || source.length === 0 || (!destination && destination !== '') || !remote) {
    throw new Error('"source", "destination" and "remote" are required');
  }

  if (path.isAbsolute(destination)) {
    throw new Error(`"destination" needs to be a relative path, actual value "${destination}".`);
  }

  const tempDir = getTempDir();
  const to = path.resolve(tempDir, destination);
  const from = path.resolve(process.cwd(), source);
  const commitMessage = options.commitMessage || 'Files added';
  const branch = options.branch || 'master';
  const deleteGlob =
    to === tempDir ? [path.resolve(to, '**/*'), `!${path.resolve(to, '.git/**/*')}`] : to;

  await del(tempDir, { force: true });
  await execa('git', ['clone', '--depth', '1', remote, tempDir]);
  await del(deleteGlob, { force: true });
  await copy(from, to);
  const gitStatus = await execa('git', ['status'], { cwd: tempDir });
  const isNothingToCommit = gitStatus.stdout.indexOf('nothing to commit') > -1;

  if (!isNothingToCommit) {
    await execa('git', ['checkout', branch], { cwd: tempDir });
    await execa('git', ['add', '-A', '.'], { cwd: tempDir });
    await execa('git', ['commit', '-m', commitMessage], { cwd: tempDir });
    await execa('git', ['push', 'origin', branch], { cwd: tempDir });
  }

  await del(tempDir, { force: true });
}

function getTempDir() {
  const tempDir = path.join(os.tmpdir(), 'send-to-git', uuidv4());
  return tempDir;
}
