// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OnchainArcade {
    struct Score {
        address player;
        uint256 score;
        uint256 timestamp;
    }

    Score[] public topScores;
    uint256 public constant MAX_SCORES = 50;

    event ScoreSubmitted(address indexed player, uint256 score);

    function submitScore(uint256 _score) public {
        require(_score > 0, "Score must be greater than 0");

        bool added = false;
        if (topScores.length < MAX_SCORES) {
            topScores.push(Score(msg.sender, _score, block.timestamp));
            added = true;
        } else if (_score > topScores[topScores.length - 1].score) {
            topScores[topScores.length - 1] = Score(msg.sender, _score, block.timestamp);
            added = true;
        }

        if (added) {
            // Sort topScores descending
            for (uint i = topScores.length - 1; i > 0; i--) {
                if (topScores[i].score > topScores[i - 1].score) {
                    Score memory temp = topScores[i];
                    topScores[i] = topScores[i - 1];
                    topScores[i - 1] = temp;
                } else {
                    break;
                }
            }
            emit ScoreSubmitted(msg.sender, _score);
        }
    }

    function getTopScores() public view returns (Score[] memory) {
        return topScores;
    }
}
