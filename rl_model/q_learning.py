import numpy as np
import random

class TrafficRL:
    def __init__(self):
        self.q_table = np.zeros((100, 2))
        self.alpha = 0.1
        self.gamma = 0.9
        self.epsilon = 0.1

    def get_state(self, traffic):
        return min(sum(traffic), 99)

    def choose_action(self, state):
        if random.uniform(0, 1) < self.epsilon:
            return random.randint(0, 1)
        return np.argmax(self.q_table[state])

    def get_reward(self, traffic):
        return -sum(traffic)

    def update(self, state, action, reward, next_state):
        self.q_table[state][action] += self.alpha * (
            reward + self.gamma * np.max(self.q_table[next_state]) - self.q_table[state][action]
        )