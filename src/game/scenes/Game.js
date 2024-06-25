import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { Client, Room } from 'colyseus.js';

export class Game extends Scene
{
  client = new Client("ws://localhost:2567");
  room = null;

  playerEntities = [];

  constructor ()
  {
      super('Game');
  }

  async create ()
  {
      this.cameras.main.setBackgroundColor(0x00FF00);

      this.add.image(512, 384, 'background').setAlpha(0.5);

      this.statusText = this.add.text(320, 180, '', {
          fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff',
          stroke: '#000000', strokeThickness: 6,
          align: 'center'
      }).setOrigin(0.5).setDepth(100);

      this.roomText = this.add.text(10, 10, 'Room', {
        fontFamily: 'Arial Black', fontSize: 16, color: '#ffffff',
        stroke: '#000000', strokeThickness: 4,
        align: 'left'
      }).setDepth(100);

      this.clientText = this.add.text(10, 30, 'Client', {
        fontFamily: 'Arial Black', fontSize: 16, color: '#ffffff',
        stroke: '#000000', strokeThickness: 4,
        align: 'left'
      }).setDepth(100);

      this.connect();

      // Connect
      // this.statusText.setText('Connecting...')

      // this.client.joinOrCreate('my_room').then(room => {
      //   console.log(room.sessionId, 'joined', room.name);
      //   this.room = room;
      //   console.log(this.room);
      //   this.roomText.setText('Room: ' + this.room.roomId);
      //   this.clientText.setText('Client: ' + this.room.sessionId);
      //   this.statusText.setText('Connected');
        
      //   this.room.onStateChange((state) => {
      //     console.log(this.room.name, "has new state:", state);
      //   });

      //   // this.room.state.players.onAdd((player, sessionId) => {
      //   //   console.log('Player',sessionId, 'joined');
      //   // });
      // }).catch(e => {
      //   console.log('JOIN ERROR', e);
      //   this.statusText.setText('Error');
      // });

      EventBus.emit('current-scene-ready', this);
  }

  changeScene ()
  {
      this.scene.start('GameOver');
  }
  
  async connect ()
  {
    this.statusText.setText('Connecting...')

    this.client.joinOrCreate('my_room').then(room => {
      console.log(room.sessionId, 'joined', room.name);
      this.room = room;
      console.log(this.room);
      
      this.room.state.players.onAdd((player, sessionId) => {
        console.log('Player',sessionId, 'joined');

        const entity = this.add.image(player.x, player.y, 'player');

        // keep a reference of it on `playerEntities`
        this.playerEntities[sessionId] = entity;
      });

      this.room.state.players.onRemove((player, sessionId) => {
        const entity = this.playerEntities[sessionId];
        if (entity) {
          // destroy entity
          entity.destroy();
  
          // clear local reference
          delete this.playerEntities[sessionId];
        }
      });
      
      this.roomText.setText('Room: ' + this.room.roomId);
      this.clientText.setText('Client: ' + this.room.sessionId);
      this.statusText.setText('Connected');
    }).catch(e => {
      console.log('JOIN ERROR', e);
      this.statusText.setText('Error');
    });
  }
}
