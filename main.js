#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const convert = require('./lib/convert-music-to-tag-music');
const stringifyObject = require('stringify-object');

let musicDir;
let onlyMP3;
let showDetail;
const failed = [];

console.error('欢迎使用！');
process.stderr.write('请输入音乐文件夹路径：');

process.stdin.setEncoding('utf8');
process.stdin.resume();

// 获取命令行输入
process.stdin.on('data', (chunk) => {
  const input = chunk.replace(/\r\n/g, '');
  if (musicDir === undefined) {
    if (fs.existsSync(input)) {
      musicDir = path.normalize(input);
      process.stderr.write('是否设置跳过非MP3文件：<N>');
    } else {
      process.stderr.write('请输入音乐文件夹路径：');
    }
  } else if (onlyMP3 === undefined) {
    if (input === '' || input.toUpperCase() === 'N') {
      onlyMP3 = false;
      process.stderr.write('是否显示详细信息：<N>');
    } else if (input.toUpperCase() === 'Y') {
      onlyMP3 = true;
      process.stderr.write('是否显示详细信息：<N>');
    } else {
      process.stderr.write('是否设置跳过非MP3文件：<N>');
    }
  } else if (showDetail === undefined) {
    if (input === '' || input.toUpperCase() === 'N') {
      showDetail = false;
      process.stdin.emit('end');
    } else if (input.toUpperCase() === 'Y') {
      showDetail = true;
      process.stdin.emit('end');
    } else {
      process.stderr.write('是否显示详细信息：<N>');
    }
  } else {
    process.stdin.emit('end');
  }
});

// 参数输入完毕，执行！
process.stdin.on('end', () => {
  // 获取目录
  const musicFiles = fs.readdirSync(musicDir);
  const musicPathArray = musicFiles.map(n => path.normalize(`${musicDir}/${n}`)).filter(n => fs.lstatSync(n).isFile());

  // 处理程序
  function convertOneByOne(pathArray, index) {
    const i = (index * 1) + 1;
    const dealMsg = `正在处理第${i + 1}个文件，共${pathArray.length}个：${pathArray[i]}`;
    process.stderr.write(dealMsg);
    convert(pathArray[i], { onlyMP3, showDetail })
      .then((data) => {
        // 输出处理信息
        process.stderr.write(`\r${dealMsg.replace(/[^\x00-\xff]/g, '  ').replace(/./g, ' ')}`);
        if (data.err !== 0) {
          failed.push({ name: path.basename(pathArray[i]), msg: data.msg });
          process.stderr.write(`\r${data.msg}：${pathArray[i]}\r\n`);
        } else {
          process.stderr.write(`\r${data.msg}：${data.done}\r\n`);
        }
        // 接着下一步或终止
        if (pathArray.length > i + 1) {
          convertOneByOne(pathArray, i, onlyMP3, showDetail);
        } else {
          console.error('=========================================');
          fs.writeFileSync(`${musicDir}/failed/failed.log`, stringifyObject(failed));
          console.log({ err: 0, msg: '处理完成！', failed });
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }

  // 开始
  console.error('=========================================\r\n开始处理！');
  convertOneByOne(musicPathArray, -1);
});

