import os from 'os';
import fs from 'fs';
import bluebird from 'bluebird';
import path from 'path';
import execa from 'execa';
import makeDir from 'make-dir';
import del from 'del';
import sendToGit from '../src/index';
import copy from '../src/copy';

const fsAccessAsync = bluebird.promisify(fs.access);

describe('while using sendToGit()', () => {
  const repoInitial = path.resolve(__dirname, './fixtures/repo-initial/**');
  const repoChanges1 = path.resolve(__dirname, './fixtures/repo-changes-1/public_html/**/*.*');
  const repoChanges2 = path.resolve(__dirname, './fixtures/repo-changes-2/public_html/**/*.*');
  const repoChanges3 = path.resolve(__dirname, './fixtures/repo-changes-3/public_html/**/*.*');
  let bareRepo = null;
  let workingRepo = null;

  beforeAll(async () => {
    // What is a bare git repository?
    // http://www.saintsjd.com/2011/01/what-is-a-bare-git-repository/

    // Create local bare git repository
    bareRepo = path.join(os.tmpdir(), 'send-to-git/test-bare-repo');
    await del(bareRepo, { force: true });
    await makeDir(bareRepo);
    await execa('git', ['init', '--bare'], { cwd: bareRepo });

    // Create local working git repository
    workingRepo = path.join(os.tmpdir(), 'send-to-git/test-working-repo');
    await del(workingRepo, { force: true });
    await makeDir(workingRepo);
    await execa('git', ['init'], { cwd: workingRepo });
    await execa('git', ['remote', 'add', 'origin', bareRepo], { cwd: workingRepo });
    // and add initial commit with files
    await copy(repoInitial, workingRepo);
    await execa('git', ['add', '.'], { cwd: workingRepo });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: workingRepo });
    await execa('git', ['push', 'origin', 'master'], { cwd: workingRepo });
  });

  afterAll(async () => {
    // Remove bare and working repository
    await del(bareRepo, { force: true });
    await del(workingRepo, { force: true });
  });

  // `fs.access` doc:
  // https://nodejs.org/api/fs.html#fs_fs_access_path_mode_callback
  it('should add new files', async () => {
    await sendToGit(repoChanges1, './public_html', bareRepo);
    await execa('git', ['pull', '--rebase', 'origin', 'master'], { cwd: workingRepo });

    const initialFile = await fsAccessAsync(path.resolve(workingRepo, 'README.md'));
    expect(initialFile).toBeUndefined();

    const newFile = await fsAccessAsync(path.resolve(workingRepo, 'public_html', 'index.html'));
    expect(newFile).toBeUndefined();
  });

  it('should not commit and push same files', async () => {
    await sendToGit(repoChanges1, './public_html', bareRepo);
    await execa('git', ['pull', '--rebase', 'origin', 'master'], { cwd: workingRepo });

    const commitsCount = await execa('git', ['rev-list', '--count', 'master'], {
      cwd: workingRepo
    });
    expect(commitsCount.stdout).toBe('2');
  });

  it('should sync folder', async () => {
    await sendToGit(repoChanges2, './public_html', bareRepo);
    await execa('git', ['pull', '--rebase', 'origin', 'master'], { cwd: workingRepo });

    const initialFile = await fsAccessAsync(path.resolve(workingRepo, 'README.md'));
    expect(initialFile).toBeUndefined();

    const newFile = await fsAccessAsync(path.resolve(workingRepo, 'public_html', '404.html'));
    expect(newFile).toBeUndefined();

    const oldFile = fsAccessAsync(path.resolve(workingRepo, 'public_html', 'index.html'));
    expect(oldFile).rejects.toMatchObject({
      code: 'ENOENT'
    });

    const commitsCount = await execa('git', ['rev-list', '--count', 'master'], {
      cwd: workingRepo
    });
    expect(commitsCount.stdout).toBe('3');
  });

  it('should add changes with different commit message when "options.commitMessage" is used', async () => {
    await sendToGit(repoChanges3, './public_html', bareRepo, {
      commitMessage: 'FOOBARFOOBARFOO'
    });
    await execa('git', ['pull', '--rebase', 'origin', 'master'], { cwd: workingRepo });

    const initialFile = await fsAccessAsync(path.resolve(workingRepo, 'README.md'));
    expect(initialFile).toBeUndefined();

    const newFile = await fsAccessAsync(path.resolve(workingRepo, 'public_html', '404.html'));
    expect(newFile).toBeUndefined();

    const commitsCount = await execa('git', ['rev-list', '--count', 'master'], {
      cwd: workingRepo
    });
    expect(commitsCount.stdout).toBe('4');

    const lastCommitName = await execa('git', ['log', '-1'], { cwd: workingRepo });
    expect(lastCommitName.stdout).toMatch(/FOOBARFOOBARFOO/);
  });
});

describe('while using sendToGit() with invalid params', () => {
  it('should throw without all the required params', async () => {
    try {
      await sendToGit();
    } catch (err) {
      expect(() => {
        throw err;
      }).toThrowErrorMatchingSnapshot();
    }
    try {
      await sendToGit([]);
    } catch (err) {
      expect(() => {
        throw err;
      }).toThrowErrorMatchingSnapshot();
    }
    try {
      await sendToGit('./some-folder');
    } catch (err) {
      expect(() => {
        throw err;
      }).toThrowErrorMatchingSnapshot();
    }
    try {
      await sendToGit('./some-folder', './some-dest');
    } catch (err) {
      expect(() => {
        throw err;
      }).toThrowErrorMatchingSnapshot();
    }
    try {
      await sendToGit(null, './some-dest', 'git@github.com:ramasilveyra/send-to-git.git');
    } catch (err) {
      expect(() => {
        throw err;
      }).toThrowErrorMatchingSnapshot();
    }
  });

  it('should throw with an absolute path in "destination" param', async () => {
    try {
      await sendToGit('./some-folder', '/foo/bar', 'git@github.com:ramasilveyra/send-to-git.git');
    } catch (err) {
      expect(() => {
        throw err;
      }).toThrowErrorMatchingSnapshot();
    }
  });

  it('should throw if "destination" param is the same as the temp folder', async () => {
    try {
      await sendToGit(
        './some-folder',
        './foo/bar/../../',
        'git@github.com:ramasilveyra/send-to-git.git'
      );
    } catch (err) {
      expect(() => {
        throw err;
      }).toThrowErrorMatchingSnapshot();
    }
  });
});
