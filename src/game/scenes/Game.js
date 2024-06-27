import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';

export class Game extends Scene
{
  elapsedTime = 0;
  fixedTimeStep = 1000 / 60;
  client = new Client("ws://localhost:2567");
  room = null;

  playerEntities = [];
  resourceEntities = [];

  // local input cache
  inputPayload = {
    left: false,
    right: false,
    up: false,
    down: false,
  };

  inputKeys = {
    left: [],
    right: [],
    up: [],
    down: [],
    action: [],
  }

  cursorKeys = null;
  playerInventoryDisplay = null;

  localPlayer = null;
  serverEntityReference = null;
  
  constructor ()
  {
      super('Game');
  }

  async create ()
  {
      this.input.mouse.disableContextMenu();
      this.cursorKeys = this.input.keyboard.createCursorKeys();
      this.inputKeys = {
        left: [this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A), this.cursorKeys.left],
        right: [this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D), this.cursorKeys.right],
        up: [this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W), this.cursorKeys.up],
        down: [this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S), this.cursorKeys.down],
        action: [this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)],
      }

      this.cameras.main.setBackgroundColor(0x333333);

      //this.add.image(512, 384, 'background').setAlpha(0.1);

      this.statusText = this.add.text(320, 180, '', {
          fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff',
          stroke: '#000000', strokeThickness: 6,
          align: 'center'
      }).setOrigin(0.5).setDepth(100);

      this.roomText = this.add.text(636, 20, 'Room', {
        fontFamily: 'Arial Black', fontSize: 12, color: '#ffffff',
        stroke: '#000000', strokeThickness: 4,
        align: 'right'
      }).setOrigin(1).setDepth(100);

      this.clientText = this.add.text(636, 36, 'Client', {
        fontFamily: 'Arial Black', fontSize: 12, color: '#ffffff',
        stroke: '#000000', strokeThickness: 4,
        align: 'right'
      }).setOrigin(1).setDepth(100);

      this.connect();

      EventBus.emit('current-scene-ready', this);
  }
 
  fixedTick() {
    //
    // paste the previous `update()` implementation here!
    //
    if (!this.localPlayer) { return; }

    const velocity = 2;

    // get input state
    this.inputPayload.left = this.inputKeys.left[0].isDown || this.inputKeys.left[1].isDown;
    this.inputPayload.right = this.inputKeys.right[0].isDown || this.inputKeys.right[1].isDown;
    this.inputPayload.up = this.inputKeys.up[0].isDown || this.inputKeys.up[1].isDown;
    this.inputPayload.down = this.inputKeys.down[0].isDown || this.inputKeys.down[1].isDown;
    
    if (Phaser.Input.Keyboard.JustDown(this.inputKeys.action[0])) {
      this.inputPayload.action = true;
    }

    // send input state to server
    if (this.inputPayload.left || this.inputPayload.right || this.inputPayload.up || this.inputPayload.down || this.inputPayload.action ) {
      this.room.send(0, this.inputPayload);
      this.inputPayload.action = false;
    }
    
    // local input
    if (this.inputPayload.left) {
      this.localPlayer.x -= velocity;
    } else if (this.inputPayload.right) {
        this.localPlayer.x += velocity;
    }

    if (this.inputPayload.up) {
        this.localPlayer.y -= velocity;
    } else if (this.inputPayload.down) {
        this.localPlayer.y += velocity;
    }
    
    // update playerEntities
    for (let sessionId in this.playerEntities) {
      // do not interpolate the current player
      if (sessionId === this.room.sessionId) {
          continue;
      }

      // interpolate all player entities
      const entity = this.playerEntities[sessionId];
      const { serverX, serverY } = entity.data.values;

      entity.x = Phaser.Math.Linear(entity.x, serverX, 0.2);
      entity.y = Phaser.Math.Linear(entity.y, serverY, 0.2);
      
    }

    this.localPlayer.x = Phaser.Math.Linear(this.localPlayer.x, this.serverEntityReference.x, 0.2);
    this.localPlayer.y = Phaser.Math.Linear(this.localPlayer.y, this.serverEntityReference.y, 0.2);
  }

  update (time, delta)
  {
    // skip loop if not connected yet.
    if (!this.localPlayer) { return; }

    // fixed tick
    this.elapsedTime += delta;
    while (this.elapsedTime >= this.fixedTimeStep) {
        this.elapsedTime -= this.fixedTimeStep;
        this.fixedTick(time, this.fixedTimeStep);
    }
  }
  
  async connect ()
  {
    this.statusText.setText('Connecting...')

    this.client.joinOrCreate('main_room_grind').then(room => {
      console.log(room.sessionId, 'joined', room.name);
      this.room = room;
      console.log(this.room);
      
      this.room.state.players.onAdd((player, sessionId) => {
        console.log('Player',sessionId, 'joined');
        const entity = this.physics.add.image(player.x, player.y, 'player');
        // keep a reference of it on `playerEntities`
        this.playerEntities[sessionId] = entity;

        if (sessionId === this.room.sessionId) {
          // this is the current player!
          // (we are going to treat it differently during the update loop)
          this.localPlayer = entity;
  
          // remoteRef is being used for debug only
          this.serverEntityReference = this.add.rectangle(0, 0, entity.width, entity.height);
          this.serverEntityReference.setStrokeStyle(1, 0xff0000);
  
          player.onChange(() => {
            this.serverEntityReference.x = player.x;
            this.serverEntityReference.y = player.y;
            this.updatePlayerInventoryDisplay(player.inventory);
          });
        } else {
          // all remote players are here!
          // (same as before, we are going to interpolate remote players)
          player.onChange(() => {
            entity.setData('serverX', player.x);
            entity.setData('serverY', player.y);
          });
        }
            
        // Alternative, listening to individual properties:
        // player.listen("x", (newX, prevX) => console.log(newX, prevX));
        // player.listen("y", (newY, prevY) => console.log(newY, prevY));
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

      this.room.state.resources.onAdd(resource => {
        console.log('onAdd this.room.state.resource', resource);
        const entity = {
          physicsImage: this.physics.add.image(resource.x, resource.y, resource.image),
          text: this.add.text(resource.x, resource.y - 16, resource.health, { fontFamily: 'Arial', fontSize: 12, color: '#ffffff', align: 'center' }).setOrigin(0.5),
          health: resource.health,
        }
        
        this.resourceEntities[resource.id] = entity;
        console.log(this.resourceEntities);
        
        resource.onChange(() => {
          entity.physicsImage.x = resource.x;
          entity.physicsImage.y = resource.y;
          entity.health = resource.health;
          entity.text.setText(resource.health);
          entity.text.x = resource.x;
          entity.text.y = resource.y - 16;
        });
      });

      this.room.state.resources.onRemove((resource) => {
        console.log(this.resourceEntities);
        const entity = this.resourceEntities[resource.id];
        if (entity) {
          // destroy entity
          entity.physicsImage.destroy();
          entity.text.destroy();
  
          // clear local reference
          delete this.resourceEntities[resource.id];
        }
        console.log(this.resourceEntities);
      });

      this.roomText.setText('Room: ' + this.room.roomId);
      this.clientText.setText('Client: ' + this.room.sessionId);
      this.statusText.setText('');
      this.updatePlayerInventoryDisplay();

    }).catch(e => {
      console.log('JOIN ERROR', e);
      this.statusText.setText('Error');
    });
  }

  togglePlayerInventoryDisplay () {
    this.playerInventoryDisplay.visible = !this.playerInventoryDisplay.visible;
  }

  // PLAYER FUNCTIONS TODO MOVE TO OWN FILE
  updatePlayerInventoryDisplay (inventory = new Map()) {
    // console.log('updatePlayerInventoryDisplay', inventory);

    if (!this.playerInventoryDisplay) {
      this.playerInventoryDisplay = this.add.text(4, 4, 'Inventory', {
        fontFamily: 'Arial Black', fontSize: 10, color: '#ffffff',
        stroke: '#000000', strokeThickness: 4,
        align: 'left'
      }).setOrigin(0).setDepth(100);
    }

    let itemList = '';
    inventory.forEach((value, key) => {
      itemList += '\n' + key + ': ' + value;
    });

    this.playerInventoryDisplay.setText('Inventory' + itemList);
  }
}
