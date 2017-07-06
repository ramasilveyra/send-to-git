import vfs from 'vinyl-fs';

export default function copy(src, dest) {
  return new Promise(resolve => {
    vfs.src(src).pipe(vfs.dest(dest)).on('end', () => {
      resolve();
    });
  });
}
