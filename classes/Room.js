const Player = require('./Player');

class Room {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.gameState = 'WAITING'; // WAITING, PLAYING, ENDED
        this.currentCard = 'g:2';
        this.currentPlayerIndex = 0;
        this.currentDirection = 1;
        this.cardsStack = [];
    }

    generateCardsStack() {
        let colors = ['r', 'g', 'b', 'y'];
        this.cardsStack = [];

        for (let i = 0; i < colors.length; i++) {
            // stop cards
            this.cardsStack.push(colors[i] + ':' + 'S');
            this.cardsStack.push(colors[i] + ':' + 'S');

            // reverse cards
            this.cardsStack.push(colors[i] + ':' + 'R');
            this.cardsStack.push(colors[i] + ':' + 'R');

            // draw 2 cards
            this.cardsStack.push(colors[i] + ':' + '+2');
            this.cardsStack.push(colors[i] + ':' + '+2');

            // 0 card
            this.cardsStack.push(colors[i] + ':' + '0');

            // number cards (two per each number greater than zero)
            for (let j = 1; j <= 9; j++) {
                this.cardsStack.push(colors[i] + ':' + j);
                this.cardsStack.push(colors[i] + ':' + j);
            }
        }

        // black function cards
        for (let j = 0; j < 4; j++) {
            this.cardsStack.push('s:+4');
            this.cardsStack.push('s:W');
        }
    }

    popRandomCardFromStack(onlyNumerics = false) {
        let randIndex = Math.floor(this.cardsStack.length * Math.random());

        while (this.cardsStack[randIndex].split(':')[0] == 's' && onlyNumerics) {
            randIndex = Math.floor(this.cardsStack.length * Math.random());
        }

        return this.cardsStack.splice(randIndex, 1)[0];
    }

    getRandomCardsSet(count) {
        let cards = [];

        for (let i = 0; i < count; i++) {
            cards.push(this.popRandomCardFromStack());
        }

        return cards;
    }

    setCurrentCard(card) {
        this.currentCard = card;

        this.sendMessageToAll({
            title: 'set-current-card',
            card: card
        });
    }

    giveStartCards() {
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].cards = [];
            this.players[i].addCards(this.getRandomCardsSet(7));
        }

        return true;
    }

    updatePlayersCardsCount() {
        let cardsCountPerPlayer = {};

        for (let i = 0; i < this.players.length; i++) {
            cardsCountPerPlayer[this.players[i].nick] = this.players[i].cards.length;
        }

        this.sendMessageToAll({
            title: 'update-players-cards-count',
            cardsCount: cardsCountPerPlayer
        });
    }

    gameStart() {
        this.gameState = 'PLAYING';
        this.currentPlayerIndex = 0;
        this.currentDirection = 1;
        this.cardsStack = [];

        this.generateCardsStack();
        this.giveStartCards();

        for (let i = 0; i < this.players.length; i++) {
            this.players[i].sendMessage({
                title: 'update-game-state',
                gameState: 'PLAYING',
                cards: this.players[i].cards
            });
        }

        this.updatePlayersCardsCount();
        this.setCurrentCard(this.popRandomCardFromStack(true));
        this.updateTurn(0);
    }

    gameStop() {
        this.gameState = 'WAITING';

        this.sendMessageToAll({
            title: 'update-game-state',
            gameState: 'WAITING'
        });
    }

    opAction(token, action) {
        if (this.players[0].token == token) {
            if (action == 'stop') {
                this.gameStop();
            }
            if (action == 'start') {
                this.gameStart();
            }
        }
    }

    endGameByWin(player) {
        this.gameState = 'WAITING';

        this.sendMessageToAll({
            title: 'update-game-state',
            gameState: 'ENDED',
            winnerNick: player.nick
        });
    }

    updateTurn(moveStep = 0, drawCards = 0) {
        if (drawCards > 0) {
            let calcSkippedIndex = (this.currentPlayerIndex + this.currentDirection) % this.players.length;

            if (calcSkippedIndex < 0) {
                calcSkippedIndex = this.players.length + calcSkippedIndex;
            }

            let skippedPlayer = this.players[calcSkippedIndex];
            skippedPlayer.addCards(this.getRandomCardsSet(drawCards));
        }

        let calcNextIndex = (this.currentPlayerIndex + (this.currentDirection * moveStep)) % this.players.length;

        if (calcNextIndex < 0) {
            calcNextIndex = this.players.length + calcNextIndex;
        }

        this.currentPlayerIndex = calcNextIndex;

        this.sendMessageToAll({
            title: 'change-turn',
            playerIndex: this.currentPlayerIndex,
            playerNick: this.players[this.currentPlayerIndex].nick
        });
    }

    playCard(token, card, changeColor) {
        let actionPlayer = this.getPlayerWithToken(token)
        let cardIndex = actionPlayer.cards.indexOf(card);

        if (cardIndex > -1) {
            let cardColor = card.split(':')[0];
            let cardName = card.split(':')[1];

            actionPlayer.hasDrawn = false;
            actionPlayer.cards.splice(cardIndex, 1);

            // skip
            if (cardName == 'S') {
                this.updateTurn(2);
            }

            // +2
            else if (cardName == '+2') {
                this.updateTurn(2, 2);
            }

            // reverse
            else if (cardName == 'R') {
                this.currentDirection *= -1;
                this.updateTurn(1);
            }

            // +4
            else if (cardName == '+4') {
                this.updateTurn(2, 4);
            }

            else {
                this.updateTurn(1);
            }

            // throw back used card to main card's stack
            this.cardsStack.push(this.currentCard);

            if (cardColor == 's') {
                this.setCurrentCard(changeColor + ':*');
            }
            else {
                this.setCurrentCard(card);
            }

            this.updatePlayersCardsCount();

            if (actionPlayer.cards.length == 0) {
                this.endGameByWin(actionPlayer);
            }
        }
    }

    playerJoin(player) {
        this.sendMessageToAll({
            title: 'player-joined',
            nick: player.nick
        });

        if (this.gameState == 'PLAYING') {
            player.cards = this.getRandomCardsSet(7);
        }

        this.players.push(player);

        var roomPlayers = [];

        for (let i = 0; i < this.players.length; i++) {
            roomPlayers.push(this.players[i].nick);
        }

        player.sendMessage({
            title: 'join-ok',
            players: roomPlayers,
            roomId: this.id,
            cards: player.cards,
            nick: player.nick,
            gameState: this.gameState,
            currentCard: this.currentCard,
            currentTurnPlayerId: this.currentPlayerIndex,
            currentTurnPlayerNick: this.players[this.currentPlayerIndex].nick
        });

        this.updatePlayersCardsCount();
    }

    playerLeft(token) {
        let playerIndex, playerNick;
        
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].token == token) {
                playerIndex = i;
                playerNick = this.players[i].nick;
                break;
            }
        }

        for (let i = 0; i < this.players[playerIndex].cards.length; i++) {
            this.cardsStack.push(this.players[playerIndex].cards[i]);
        }

        this.players.splice(playerIndex, 1);

        this.sendMessageToAll({
            title: 'player-left',
            nick: playerNick
        });

        this.updateTurn(0);
    }

    getPlayerWithToken(token) {
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].token == token) {
                return this.players[i];
            }
        }

        return null;
    }

    sendMessageToAll(message) {
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].sendMessage(message);
        }
    }

    hasPlayerWithToken(token) {
        return this.getPlayerWithToken(token) != null;
    }

    drawCard(token) {
        let player = this.getPlayerWithToken(token);

        if (this.gameState != 'PLAYING' || this.players.indexOf(player) != this.currentPlayerIndex || player.hasDrawn) {
            return;
        }

        player.hasDrawn = true;
        player.addCards(this.getRandomCardsSet(1));
        this.updatePlayersCardsCount();
    }

    skipTurn(token) {
        let player = this.getPlayerWithToken(token);

        if (this.gameState != 'PLAYING' || this.players.indexOf(player) != this.currentPlayerIndex || player.hasDrawn == false) {
            return;
        }

        player.hasDrawn = false;
        this.updateTurn(1);
    }

    hasPlayerWithNick(nick) {
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].nick == nick) {
                return true;
            }
        }

        return false;
    }

    chatSend(token, text) {
        let senderPlayer = this.getPlayerWithToken(token);

        this.sendMessageToAll({
            title: 'chat-message',
            nick: senderPlayer.nick,
            text: text
        });
    }
}

module.exports = Room;