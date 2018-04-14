const fs = require('fs');
const path = require('path');
const spawnSync = require('child_process').spawnSync;
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const Editor = require('./mp3-tag-editor');
const MusicTagFetch = require('./music-tag-fetch');

function convertMusicToTagMusic(src, { onlyMP3, showDetial = false }) {
  // 控制显示调试信息
  let log = {};
  if (showDetial) log = console;
  else log = { error() {}, log() {} };

  let filePath = '';
  if (path.isAbsolute(src)) filePath = src;
  else filePath = path.normalize(`${__dirname}/${src}`);
  const rawPath = filePath;
  log.error(`输入文件为：${filePath}\n正在读取信息...`);

  // 创建成功文件存放目录
  const doneDir = path.normalize(`${filePath}/../done`);
  if (!fs.existsSync(doneDir)) {
    fs.mkdirSync(doneDir);
  }

  // 创建失败文件存放目录
  const failedDir = path.normalize(`${filePath}/../failed`);
  if (!fs.existsSync(failedDir)) {
    fs.mkdirSync(failedDir);
  }

  return new Promise((resolve, reject) => {
    // 读取音乐文件信息
    const infoStr = spawnSync(
      ffprobeStatic.path,
      ['-show_format', '-print_format', 'json', filePath],
    ).stdout.toString();
    const info = JSON.parse(infoStr);
    if (!info.format) {
      log.error('读取文件失败！');
      fs.copyFileSync(rawPath, `${failedDir}/${path.basename(filePath)}`);
      resolve({ err: 1, msg: `读取文件失败：${filePath}` });
      return false;
    }
    // 时长&格式
    const duration = info.format.duration;
    const format = info.format.format_name;
    // 文件名
    const fileName = path.parse(filePath).name;
    log.error('文件信息读取完成！');

    // 转码
    if (onlyMP3) {
      log.error('已设置为跳过非MP3文件！');
      if (format !== 'mp3') {
        log.error(`该文件类型为：${format}，已跳过！`);
        resolve({ err: 2, msg: `该文件类型为：${format}，已跳过！` });
        return false;
      }
    } else if (format !== 'mp3') {
      log.error(`该文件类型为：${format}，开始转码...请等待！`);
      const tempDir = path.normalize(`${filePath}/../temp`);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
      const srcPath = filePath;
      filePath = path.normalize(`${filePath}/../temp/${fileName}.mp3`);
      const transcode = spawnSync(ffmpegStatic.path, ['-i', srcPath, '-y', filePath]);
      if (transcode.status === 0) {
        log.error('转码完成！');
      } else {
        log.error('转码失败！');
        fs.copyFileSync(rawPath, `${failedDir}/${path.basename(filePath)}`);
        resolve({ err: 3, msg: `转码失败：${filePath}` });
        return false;     
      }
    }

    // 操作
    // 获取标签
    const fetch = new MusicTagFetch();
    const editor = new Editor();
    let fetchResult = {};
    log.error('正在联网获取音乐标签...');
    fetch.fetchFromQQ(fileName, parseInt(duration))
      .then((data) => {
        log.error('获取成功！正在写入新的文件...');
        fetchResult = data;
        const fileBuffer = fs.readFileSync(filePath);
        return editor.load(fileBuffer);
      })
      .then(() => {
        editor
          .set('title', fetchResult.songName)
          .set('track', fetchResult.track)
          .set('disk', fetchResult.disk)
          .set('album', fetchResult.album)
          .set('year', fetchResult.year)
          .set('label', fetchResult.label)
          .set('artists', fetchResult.artists)
          .set('genres', fetchResult.genres)
          .set('duration', parseInt(duration*1000))
          .set('picture', {
            type: 3,
            data: fetchResult.picBuffer,
            description: 'description',
            useUnicodeEncoding: false,
          })
          .set('lyrics', {
            description: 'description',
            lyrics: fetchResult.lyric,
          });

        const savedPath = path.normalize(`${doneDir}/${fileName}.mp3`);
        return editor.saveAsFile(savedPath);
      })
      .then((doneName) => {
        log.error(`文件写入成功! \n新的文件地址：${doneName}`);
        resolve({ err: 0, msg: '文件写入成功!', done: doneName });
      })
      .catch((err) => {
        fs.copyFileSync(rawPath, `${failedDir}/${path.basename(filePath)}`);
        log.error(err);
        resolve({ err: 4, msg: err.toString() });
      });
  });
}

module.exports = convertMusicToTagMusic;

// convertMusicToTagMusic('../assets/薛之谦 - 你还要我怎样.mp3', { onlyMP3: false, showDetial: true })
//   .then((data) => {
//     console.log(data);
//   });
