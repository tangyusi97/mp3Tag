
const request = require('request');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');
const md5 = require('md5');
const JSON5 = require('json5');
const he = require('he');
const cookie = require('cookie');

class MusicTagFetch {
  constructor() {
    this.headers = {
      cookie: '',
      referer: '',
    };
    this.XiaMiData = {};
    this.QQData = {};
  }

  getPage(url, charset = 'utf-8', raw = false, json = false) {
    return new Promise((resolve, reject) => {
      const opts = {
        url,
        headers: {
          cookie: this.headers.cookie,
          referer: this.headers.referer,
        },
        encoding: null,
        json,
      };
      request(opts, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          // 设置json时直接输出json对象
          const content = !raw ? iconv.decode(body, charset) : body;
          resolve(content);
        } else {
          reject(new Error(error));
        }
      });
    });
  }

  loginXiaMi({ username, password }) {
    return new Promise((resolve, reject) => {
      request('https://passport.xiami.com/?redirectURL=http://www.xiami.com', (error, response, body) => {
        // 获取cookie
        const cookies = response.headers['set-cookie'].join(';');
        // 拼接请求地址
        const loginUrl = 'https://passport.xiami.com/xiami-login?_xm_cf_=' + cookie.parse(cookies)['_xm_cf_']; // eslint-disable-line
        // 请求数据
        const postData = {
          account: username,
          password: md5(password),
          nco_sign: '',
          nco_sessionid: '',
          nco_token: '',
        };
        const headers = {
          Cookie: cookies,
        };
        // request选项
        const opts = {
          url: loginUrl,
          method: 'POST',
          headers,
          body: postData,
          json: true,
        };
        // 模拟登陆
        request(opts, (e, r, b) => {
          this.headers.cookie = r.headers['set-cookie'].join(';');
          resolve(b);
        });
      });
    });
  }

  /**  暂未做歌名匹配  * */
  searchFromXiaMi(key) {
    return new Promise((resolve, reject) => {
      this.getPage(`https://www.xiami.com/search?key=${encodeURI(key)}`)
        .then((content) => {
          const $ = cheerio.load(content);
          const row = $('table.track_list > tbody > tr').eq(0);
          if (row.length > 0) {
            const title = row.find('td.song_name').text().trim();
            const titleLink = row.find('td.song_name > a').attr('href');
            const artists = [row.find('td.song_artist').text().replace(/\((.|\n)*\)/g, '').trim()];
            const album = row.find('td.song_album').text().replace(/[《》]/g, '').trim();
            const albumLink = row.find('td.song_album > a').attr('href');
            resolve({
              title, titleLink, artists, album, albumLink,
            });
          } else {
            reject(new Error('暂未搜索到歌曲！'));
          }
        })
        .catch((err) => { reject(err); });
    });
  }

  albumFromXiaMi(title, albumLink) {
    return new Promise((resolve, reject) => {
      this.getPage(albumLink)
        .then((content) => {
          const $ = cheerio.load(content);
          const coverUrl = $('#cover_lightbox').attr('href');
          const label = $('#album_info > table > tbody > tr').eq(2).find('td:last-child').text()
            .trim();
          const year = $('#album_info > table > tbody > tr').eq(3).find('td:last-child').text()
            .trim()
            .substr(0, 4);
          let style = $('#album_info > table > tbody > tr').eq(5).find('td:last-child').text()
            .replace(/[a-zA-Z ]/g, '');
          style = style.split(',');
          const track = $('#track > div > table').find('td.song_name').filter(function() {
            return $(this).find('a').eq(0).text()
              .trim() === title;
          }).prev()
            .text()
            .trim();
          resolve({
            coverUrl, label, year, style, track,
          });
        })
        .catch((err) => { reject(err); });
    });
  }

  lyricFromXiaMi(titleLink) {
    return new Promise((resolve, reject) => {
      this.getPage(titleLink)
        .then((content) => {
          const $ = cheerio.load(content);
          const lyrics = $('#lrc > .lrc_main').text().replace(/["\t]/g, '');
          resolve({ lyrics });
        })
        .catch((err) => { reject(err); });
    });
  }

  fetchFromXiaMi(keywords) {
    return new Promise((resolve, reject) => {
      this.searchFromXiaMi(keywords)
        .then((data) => {
          Object.keys(data).forEach((key) => {
            this.XiaMiData[key] = data[key];
          });
          return this.albumFromXiaMi(data.title, data.albumLink);
        })
        .then((data) => {
          Object.keys(data).forEach((key) => {
            this.XiaMiData[key] = data[key];
          });
          return this.lyricFromXiaMi(this.XiaMiData.titleLink);
        })
        .then((data) => {
          Object.keys(data).forEach((key) => {
            this.XiaMiData[key] = data[key];
          });
          resolve(this.XiaMiData);
        })
        .catch((err) => { reject(err); });
    });
  }

  /**  通过时长作歌曲匹配  * */
  searchFromQQ(keywords, sec, num = 9) {
    const searchUrl = `http://s.music.qq.com/fcgi-bin/music_search_new_platform?t=0&n=${num}&aggr=1&cr=1&loginUin=0&format=json&inCharset=GB2312&outCharset=utf-8&notice=0&platform=jqminiframe.json&needNewCode=0&p=1&catZhida=0&remoteplace=sizer.newclient.next_song&w=${encodeURI(keywords)}`;
    return new Promise((resolve, reject) => {
      this.getPage(searchUrl, '', true, true)
        .then((data) => {
          let theSong = {};
          let timeDiff = 4;  // 最大时差（不包含）
          data.data.song.list.forEach((n) => {
            const timeDiff1 = Math.abs(MusicTagFetch.QQTagParse(n.f).sec - sec);
            if (timeDiff1 < timeDiff) {
              theSong = n;
              timeDiff = timeDiff1;
            }
            if (timeDiff < 2) return false;
            n.grp.forEach((m) => {
              const timeDiff2 = Math.abs(MusicTagFetch.QQTagParse(m.f).sec - sec);
              if (timeDiff2 < timeDiff) {
                theSong = m;
                timeDiff = timeDiff2;
                if (timeDiff < 2) return false;
              }
            });
          });
          if (theSong.f) {
            const theSongInfo = MusicTagFetch.QQTagParse(theSong.f);
            theSongInfo.year = new Date(theSong.pubTime * 1000).getFullYear();
            resolve(theSongInfo);
          } else {
            reject(new Error(`暂未搜索到歌曲！关键字：${keywords}，时长：${sec}`));
          }
        })
        .catch((err) => { reject(err); });
    });
  }

  static QQTagParse(f) {
    const dataArray = f.split('|');
    if (dataArray.length === 25) {
      const songId = dataArray[0];
      const title = he.decode(he.decode(dataArray[1])).replace(/\(.*\)/g, '').trim();
      const artists = he.decode(he.decode(dataArray[3])).split(';');
      const album = he.decode(he.decode(dataArray[5]));
      const imageId = dataArray[6];
      const sec = dataArray[7];
      const songMid = dataArray[20];
      const albumMid = dataArray[22];
      return {
        songId, title, artists, album, imageId, sec, songMid, albumMid,
      };
    }
    return {};
  }

  coverFromQQ(albumMid) {
    const picUrl = `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`;
    return new Promise((resolve, reject) => {
      this.getPage(picUrl, '', true)
        .then((picBuffer) => {
          resolve({ picBuffer });
        })
        .catch((err) => { reject(err); });
    });
  }

  lyricFromQQ(songId) {
    this.headers.referer = 'https://y.qq.com/';
    return new Promise((resolve, reject) => {
      this.getPage(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric.fcg?nobase64=1&musicid=${songId}&callback=jsonp1&g_tk=5381&jsonpCallback=jsonp1&loginUin=0&hostUin=0&format=jsonp&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`)
        .then((data) => {
          const rawLyric = JSON.parse(data.substring(7, data.length - 1)).lyric;
          if (rawLyric) {
            const lyric = he.decode(rawLyric);
            resolve({ lyric });
          }
          else {
            resolve({ lyric:'' });
          }
        })
        .catch((err) => { reject(err); });
    });
  }

  albumFromQQ(albumMid, songId) {
    return new Promise((resolve, reject) => {
      this.getPage(`https://y.qq.com/n/yqq/album/${albumMid}.html`)
        .then((data) => {
          // 获取html的信息
          const $ = cheerio.load(data);

          const genres = $('ul.data__info > li').filter(function() {
            return /流派/.test($(this).text());
          }).text().substr(3)
            .replace(/ (?=[\u4e00-\u9fa5])/, ';')
            .split(';');

          const label = $('ul.data__info > li').filter(function() {
            return /发行公司/.test($(this).text());
          }).text().substr(5)
            .trim();

          // 获取js中的信息
          let info = /album\.init\({(.|\n|\r)*?}(?=\);)/.exec(data);
          if (!info) {
            reject(new Error(`暂未获取到专辑信息！`));
            return false;
          }
          info = JSON5.parse(info[0].substr(11));
          const cdArr = info.cdArr;
          const totalDisk = cdArr.length;
          let curDisk = 0;
          let track = 0;
          let songName = '';
          Object.keys(cdArr).forEach((i) => {
            Object.keys(cdArr[i]).forEach((j) => {
              if (cdArr[i][j].chapter) {
                Object.keys(cdArr[i][j].songs).forEach((k)=>{
                  if (`${songId}` === `${cdArr[i][j].songs[k].songid}`) {
                    songName = cdArr[i][j].songs[k].songname;
                    track = (k * 1) + 1;
                    curDisk = (j * 1) + 1;
                  }
                });
              } else if (`${songId}` === `${cdArr[i][j].songid}`) {
                songName = cdArr[i][j].songname;
                track = (j * 1) + 1;
                curDisk = (i * 1) + 1;
              }
            });
          });
          const disk = `${curDisk}/${totalDisk}`;

          resolve({
            genres, label, track, disk, songName,
          });
        })
        .catch((err) => { reject(err); });
    });
  }

  fetchFromQQ(keywords, sec) {
    return new Promise((resolve, reject) => {
      this.searchFromQQ(keywords, sec)
        .then((data) => {
          Object.keys(data).forEach((key) => {
            this.QQData[key] = data[key];
          });
          return this.coverFromQQ(this.QQData.albumMid);
        })
        .then((data) => {
          Object.keys(data).forEach((key) => {
            this.QQData[key] = data[key];
          });
          return this.lyricFromQQ(this.QQData.songId, this.QQData.songMid);
        })
        .then((data) => {
          Object.keys(data).forEach((key) => {
            this.QQData[key] = data[key];
          });
          return this.albumFromQQ(this.QQData.albumMid, this.QQData.songId);
        })
        .then((data) => {
          Object.keys(data).forEach((key) => {
            this.QQData[key] = data[key];
          });
          resolve(this.QQData);
        })
        .catch((err) => { reject(err); });
    });
  }
}


module.exports = MusicTagFetch;

// const fetch = new MusicTagFetch();
// fetch.fetchFromQQ('薛之谦 - 你还要我怎样', 311)
//   .then((data) => {
//     console.log(data);
//   })
//   .catch(data => console.log(data));
/*
  { songId: '1456026',
    title: '是时候',
    artists: [ '孙燕姿' ],
    album: '史上最伤感的网络情歌',
    imageId: '2070984',
    sec: '240',
    songMid: '000hWh3b3hEyJc',
    albumMid: '000cgmJ63rrIek',
    year: 2011,
    picBuffer: <Buffer ff d8 ff e0 00 10 4a 46 49 46 00 01 01 00 00 01 00 01 00 00 ff db 00 43 00 09 09 09 09 09 09 09 09 09 09 09 09 0b 0b 0b 0b 0b 0b 0b 0b 0b 0b 0b 0b 0b ... >,
    lyric: '[ti:是时候]\r\n[ar:孙燕姿]\r\n[al:史上最伤感的网络情歌 CD1]\r\n[offset:0]\r\n[00:00.95]是时候 - 孙燕姿\r\n[00:01.93]词：钟礽依\r\n[00:02.89]曲：饶善强\r\n[00:29.02]害怕看见 你骤变的脸\r\n[00:36.21]也不想理解 失温的语言\r\n[00:42.78]\r\n[00:43.84]是时候 该转身就走\r\n[00:50.46]\r\n[00:51.40]从此放弃我们渴望的永久\r\n[00:58.84]\r\n[01:00.46]不想承认 你还出现梦中\r\n[01:04.96]温暖安慰我\r\n[01:07.46]\r\n[01:08.03]即使一秒钟 也难承受\r\n[01:14.28]\r\n[01:15.52]我多恨自 己轻易地放开手\r\n[01:22.09]以为能承受 还能从容不迫\r\n[01:28.84]\r\n[01:29.40]坚强不是我 想要的解脱\r\n[01:37.09]假装能好好过\r\n[01:41.28]\r\n[02:01.31]害怕察觉 你分心的眼\r\n[02:07.37]\r\n[02:08.50]不想再争辩 你说的谎言\r\n[02:15.12]\r\n[02:16.12]是时候 就放手 谁能够\r\n[02:27.87]\r\n[02:29.50]我多恨自己就这样让你走\r\n[02:34.31]\r\n[02:35.43]以为很洒脱  以为这是温柔\r\n[02:42.75]却忘了你和我 一样的脆弱\r\n[02:50.43]一样的难过\r\n[02:54.84]\r\n[02:56.41]多希望自己就这样松 开手\r\n[03:00.97]\r\n[03:01.72]一切很洒脱 好好看着你走\r\n[03:08.91]坚强该是我 给你的自由\r\n[03:16.16]\r\n[03:21.97]还能做什么\r\n[03:26.03]\r\n\r\n',
    genres: [ 'Pop', '流行' ],
    label: '',
    track: 4,
    disk: '1/2',
    songName: '是时候'
  }
*/

// xiami.loginXiaMi({ username: '15880272812', password: '7ujk0O2396' })
//   .then(() => xiami.fetchFromXiaMi('五月天 - 转眼'))
//   .then((data) => console.log(data));

