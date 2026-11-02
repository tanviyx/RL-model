"""
Step 4: Deep Q-Network (PyTorch).

  * QNetwork       - neural network that maps a traffic state (35 values) to a Q-value for each of the
                     8 signal actions (phase x green duration). It learns the relationship between
                     traffic conditions and how good each signal decision is.
  * ReplayBuffer   - EXPERIENCE REPLAY: stores past (state, action, reward, next_state, done) transitions
                     and trains on random mini-batches, which breaks the correlation between
                     consecutive steps and lets the agent learn from old experience again.
  * target network - a slowly updated copy of the Q-network used to compute the learning targets,
                     which stabilises training.
  * epsilon-greedy - with probability epsilon pick a random action (explore), otherwise the action
                     with the highest Q-value (exploit). Epsilon is decayed by the training script.
"""
import os
import random
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim


class QNetwork(nn.Module):
    def __init__(self, state_size, action_size, hidden=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_size, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, action_size),
        )

    def forward(self, x):
        return self.net(x)


class ReplayBuffer:
    def __init__(self, capacity=50_000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        s, a, r, s2, d = zip(*batch)
        return (np.array(s, dtype=np.float32), np.array(a, dtype=np.int64), np.array(r, dtype=np.float32),
                np.array(s2, dtype=np.float32), np.array(d, dtype=np.float32))

    def __len__(self):
        return len(self.buffer)


class DQNAgent:
    def __init__(self, state_size, action_size, lr=1e-3, gamma=0.95, batch_size=64,
                 buffer_size=50_000, min_buffer=500, target_update=500, hidden=128, device=None):
        self.state_size, self.action_size = state_size, action_size
        self.gamma, self.batch_size = gamma, batch_size
        self.min_buffer, self.target_update = min_buffer, target_update
        self.device = torch.device(device or "cpu")

        self.policy_net = QNetwork(state_size, action_size, hidden).to(self.device)
        self.target_net = QNetwork(state_size, action_size, hidden).to(self.device)
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval()                                   # target network is never trained directly

        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=lr)
        self.loss_fn = nn.SmoothL1Loss()                         # Huber loss: robust to large rewards
        self.memory = ReplayBuffer(buffer_size)
        self.learn_steps = 0

    # ---- acting: epsilon-greedy ---------------------------------------------
    def select_action(self, state, epsilon=0.0):
        if random.random() < epsilon:
            return random.randrange(self.action_size)            # explore
        with torch.no_grad():
            q = self.policy_net(torch.as_tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0))
        return int(q.argmax(dim=1).item())                       # exploit

    # ---- learning: experience replay + target network ------------------------
    def remember(self, state, action, reward, next_state, done):
        self.memory.push(state, action, reward, next_state, float(done))

    def learn(self):
        """One gradient step on a random mini-batch. Returns the loss, or None if too little experience yet."""
        if len(self.memory) < max(self.batch_size, self.min_buffer):
            return None
        s, a, r, s2, d = [torch.as_tensor(x, device=self.device) for x in self.memory.sample(self.batch_size)]

        q_sa = self.policy_net(s).gather(1, a.unsqueeze(1)).squeeze(1)          # Q(s, a) from the policy network
        with torch.no_grad():
            next_q = self.target_net(s2).max(dim=1)[0]                           # best next value from the TARGET network
            target = r + self.gamma * next_q * (1.0 - d)                         # Bellman target
        loss = self.loss_fn(q_sa, target)

        self.optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(self.policy_net.parameters(), 10.0)
        self.optimizer.step()

        self.learn_steps += 1
        if self.learn_steps % self.target_update == 0:                           # periodically sync the target network
            self.target_net.load_state_dict(self.policy_net.state_dict())
        return float(loss.item())

    # ---- saving / loading -------------------------------------------------------
    def save(self, path, episode=0, save_memory=True):
        torch.save({"policy": self.policy_net.state_dict(), "target": self.target_net.state_dict(),
                    "optimizer": self.optimizer.state_dict(), "learn_steps": self.learn_steps,
                    "episode": episode}, path)
        if save_memory:
            torch.save(list(self.memory.buffer), path + ".memory")

    def load(self, path, load_memory=True):
        ck = torch.load(path, map_location=self.device, weights_only=False)
        self.policy_net.load_state_dict(ck["policy"])
        self.target_net.load_state_dict(ck["target"])
        self.optimizer.load_state_dict(ck["optimizer"])
        self.learn_steps = ck["learn_steps"]
        if load_memory and os.path.exists(path + ".memory"):
            self.memory.buffer.extend(torch.load(path + ".memory", weights_only=False))
        return ck["episode"]
