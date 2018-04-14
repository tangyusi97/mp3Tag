
const fs = require('fs');
const reader = require('jsmediatags');
const Writer = require('browser-id3-writer');
const Remover = require('remove-id3v1');

const imageTypes = [
  'Other',
  '32x32 pixels \'file icon\' (PNG only)',
  'Other file icon',
  'Cover (front)',
  'Cover (back)',
  'Leaflet page',
  'Media (e.g. label side of CD)',
  'Lead artist/lead performer/soloist',
  'Artist/performer',
  'Conductor',
  'Band/Orchestra',
  'Composer',
  'Lyricist/text writer',
  'Recording Location',
  'During recording',
  'During performance',
  'Movie/video screen capture',
  'A bright coloured fish',
  'Illustration',
  'Band/artist logotype',
  'Publisher/Studio logotype',
];

const editableMap = [
  { frame: 'TPE1', name: 'artists', transform: s => s.split('/') },
  { frame: 'TCOM', name: 'composers', transform: s => s.split('/') },
  { frame: 'TCON', name: 'genres', transform: s => s.split(';') },
  { frame: 'TIT2', name: 'title' },
  { frame: 'TALB', name: 'album' },
  { frame: 'TPE2', name: 'albumartist' },
  { frame: 'TYER', name: 'year', transform: parseInt },
  {
    frame: 'USLT',
    name: 'lyrics',
    transform: o => ({
      description: o.descriptor,
      lyrics: o.lyrics,
    }),
  },
  {
    frame: 'APIC',
    name: 'picture',
    transform: o => ({
      type: imageTypes.indexOf(o.type),
      data: Buffer.from(o.data),
      description: o.description,
      useUnicodeEncoding: false,
    }),
  },
  { frame: 'TRCK', name: 'track' },
  { frame: 'TPUB', name: 'label' },
  { frame: 'TPOS', name: 'disk' },
  {
    frame: 'COMM',
    name: 'comment',
    transform: o => ({
      description: '',
      text: o.text,
    }),
  },
  {
    frame: 'TXXX',
    name: 'user',
    transform: o => ({
      description: o.user_description,
      value: o.data,
    }),
  },
  { frame: 'TLEN', name: 'duration' },
];

const readonlyMap = [
  { frame: 'TPE3', name: 'TPE3' },
  { frame: 'TPE4', name: 'TPE4' },
  { frame: 'TMED', name: 'TMED' },
  { frame: 'TBPM', name: 'TBPM' },
  { frame: 'TKEY', name: 'TKEY' },
  { frame: 'WCOM', name: 'WCOM' },
  { frame: 'WCOP', name: 'WCOP' },
  { frame: 'WOAF', name: 'WOAF' },
  { frame: 'WOAR', name: 'WOAR' },
  { frame: 'WOAS', name: 'WOAS' },
  { frame: 'WORS', name: 'WORS' },
  { frame: 'WPAY', name: 'WPAY' },
  { frame: 'WPUB', name: 'WPUB' },
];

class Editor {
  load(buffer) {
    return new Promise((resolve, reject) => {
      this.buffer = buffer;
      this.writer = new Writer(this.buffer);
      this.tag = {
        readonly: {},
      };

      reader.read(this.buffer, {
        onSuccess: (rawTag) => {
          this.saveRawTag(rawTag);
          resolve(this);
        },
        onError: reject,
      });
    });
  }

  saveRawTag(rawTag) {
    this.tag = {
      readonly: {},
    };

    editableMap.filter(pair => !!rawTag.tags[pair.frame]).forEach((pair) => {
      if (rawTag.tags[pair.frame].data) {
        if (pair.transform) {
          this.tag[pair.name] = pair.transform(rawTag.tags[pair.frame].data);
        } else {
          this.tag[pair.name] = rawTag.tags[pair.frame].data;
        }
      }
    });

    readonlyMap.filter(pair => !!rawTag.tags[pair.frame]).forEach((pair) => {
      this.tag.readonly[pair.name] = rawTag.tags[pair.frame].data;
    });
  }

  getTag() {
    return this.tag;
  }

  applyTag(tag) {
    editableMap.filter(pair => !!tag[pair.name]).forEach((pair) => {
      this.writer.setFrame(pair.frame, tag[pair.name]);
    });

    readonlyMap.filter(pair => !!tag.readonly[pair.name]).forEach((pair) => {
      this.writer.setFrame(pair.frame, tag.readonly[pair.name]);
    });

    this.writer.addTag();
    this.buffer = Buffer.from(this.writer.arrayBuffer);
  }

  removeID3v1() {
    const hasTag = Remover.hasTag(this.buffer);
    if (hasTag) {
      this.buffer = Remover.removeTag(this.buffer);
      this.writer = new Writer(this.buffer);
    }
  }

  save() {
    return new Promise((resolve) => {
      this.applyTag(this.tag);
      this.removeID3v1();
      resolve();
    });
  }

  saveAsFile(path) {
    return new Promise((resolve, reject) => {
      this.save()
        .then(() => {
          fs.writeFileSync(path, Buffer.from(this.buffer));
          resolve(path);
        })
        .catch((data) => {
          console.log(data);
        });
    });
  }

  get(field) {
    return this.tag[field];
  }

  set(field, value) {
    this.tag[field] = value;
    return this;
  }
}

module.exports = Editor;

// const path = require('path');

// const filePath = 'C:\\Users\\20804\\Desktop\\mp3Tag\\assets\\郁可唯 - 时间煮雨.mp3';
// const editor = new Editor();
// const fileBuffer = fs.readFileSync(filePath);
// editor.load(fileBuffer)
//   .then(() => {
//     console.log(editor.getTag());
//     editor
//       .set('title', '时间煮雨 (《小时代》电影主题曲)')
//       .set('track', '1')
//       .set('disk', '1/1')
//       .set('album', '小时代1：折纸时代 电影原声带')
//       .set('year', 2013)
//       .set('artists', ['郁可唯'])
//       .set('genres', ['Soundtrack', '原生'])
//       .set('duration', 247000)
//       .set('picture', {
//         type: 3,
//         data: fs.readFileSync('C:\\Users\\20804\\Desktop\\mp3Tag\\assets\\cover.jpg'),
//         description: 'description',
//         useUnicodeEncoding: false,
//       })
//       .set('lyrics', {
//         description: 'description',
//         lyrics: '风吹雨成花',
//       });

//     const savedPath = path.normalize(`${filePath}/../done/${path.basename(filePath)}`);
//     return editor.saveAsFile(savedPath);
//   })
//   .then((data) => {
//     console.log(data);
//   });
